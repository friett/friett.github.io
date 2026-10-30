// Gemma 4 E2B in the visitor's browser, on WebGPU, in a worker so the page stays responsive.
// Text only: Gemma4ForCausalLM loads the word tables and the decoder (about 3.1 GB, q4f16) and
// skips the image and audio encoders. The browser caches the files, so a second visit starts in
// seconds. Nothing is sent to the site: the context comes in with each request.
import { AutoTokenizer, Gemma4ForCausalLM, InterruptableStoppingCriteria, TextStreamer, type PreTrainedTokenizer } from "@huggingface/transformers";

export const MODEL_ID = "onnx-community/gemma-4-E2B-it-ONNX";

export type ToWorker =
  | { type: "load" }
  | { type: "generate"; id: number; messages: { role: "system" | "user" | "assistant"; content: string }[]; maxTokens: number }
  | { type: "stop" };

export type FromWorker =
  | { type: "progress"; loaded: number; total: number }
  | { type: "ready" }
  | { type: "error"; message: string; id?: number }
  | { type: "token"; id: number; text: string }
  | { type: "done"; id: number };

let tokenizer: PreTrainedTokenizer | null = null;
let model: Awaited<ReturnType<typeof Gemma4ForCausalLM.from_pretrained>> | null = null;
let loading: Promise<void> | null = null;
const stopping = new InterruptableStoppingCriteria();
const post = (m: FromWorker) => (self as unknown as Worker).postMessage(m);

// Gemma's own turn and channel markers, which the streamer can let through.
const MARKERS = /<\|channel\|>|<channel\|>|<turn\|>|<eos>|<bos>|<\|channel>|<end_of_turn>|<start_of_turn>(model|user)?/g;

async function load() {
  const files = new Map<string, { loaded: number; total: number }>();
  tokenizer = await AutoTokenizer.from_pretrained(MODEL_ID);
  model = await Gemma4ForCausalLM.from_pretrained(MODEL_ID, {
    dtype: { embed_tokens: "q4f16", decoder_model_merged: "q4f16" },
    device: "webgpu",
    progress_callback: (p: { status: string; file?: string; loaded?: number; total?: number }) => {
      if (p.status !== "progress" || !p.file || !p.total) return;
      files.set(p.file, { loaded: p.loaded ?? 0, total: p.total });
      let loaded = 0;
      let total = 0;
      for (const f of files.values()) {
        loaded += f.loaded;
        total += f.total;
      }
      post({ type: "progress", loaded, total });
    },
  });
  post({ type: "ready" });
}

self.onmessage = async (e: MessageEvent<ToWorker>) => {
  const msg = e.data;
  if (msg.type === "load") {
    loading ??= load().catch((err: unknown) => {
      loading = null;
      post({ type: "error", message: err instanceof Error ? err.message : "The model could not load" });
    });
    await loading;
    return;
  }
  if (msg.type === "stop") {
    stopping.interrupt();
    return;
  }
  if (!tokenizer || !model) {
    post({ type: "error", id: msg.id, message: "The model is not loaded yet" });
    return;
  }
  stopping.reset();
  try {
    const inputs = tokenizer.apply_chat_template(msg.messages, { add_generation_prompt: true, return_dict: true }) as Record<string, unknown>;
    const streamer = new TextStreamer(tokenizer, {
      skip_prompt: true,
      skip_special_tokens: true,
      callback_function: (text: string) => {
        const clean = text.replace(MARKERS, "");
        if (clean) post({ type: "token", id: msg.id, text: clean });
      },
    });
    await model.generate({ ...inputs, max_new_tokens: msg.maxTokens, do_sample: false, streamer, stopping_criteria: stopping });
    post({ type: "done", id: msg.id });
  } catch (err) {
    post({ type: "error", id: msg.id, message: err instanceof Error ? err.message : "The model stopped with an error" });
  }
};
