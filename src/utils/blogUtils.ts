import { glob } from "glob";
import fs from "fs";
import path from "path";
import matter from "gray-matter";

export interface BlogPost {
  slug: string;
  title: string;
  date: string;
  tags: string[];
  content: string;
  preview: string;
  audio?: string;
}

function getAudioUrl(slug: string): string | undefined {
  const audioPath = path.join(process.cwd(), "public", "audio", `${slug}.mp3`);
  if (fs.existsSync(audioPath)) {
    return `/audio/${slug}.mp3`;
  }
  return undefined;
}

function generatePreview(content: string, length = 150): string {
  const plainText = content
    .replace(/#+\s+(.*)/g, "$1")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/\[(.*?)\]\(.*?\)/g, "$1")
    .replace(/!\[(.*?)\]\(.*?\)/g, "$1")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`(.*?)`/g, "$1")
    .trim();

  const firstParagraph =
    plainText.split("\n\n").find((p) => p.trim().length > 0) || "";

  if (firstParagraph.length <= length) {
    return firstParagraph;
  }

  const lastSpace = firstParagraph.substring(0, length).lastIndexOf(" ");
  return `${firstParagraph.substring(0, lastSpace)}...`;
}

export async function getAllPosts(): Promise<BlogPost[]> {
  const contentDir = path.join(process.cwd(), "src/content/blog");
  const files = await glob("*.md", { cwd: contentDir });

  const posts = files.map((filename) => {
    const filePath = path.join(contentDir, filename);
    const fileContent = fs.readFileSync(filePath, "utf8");
    const { data, content } = matter(fileContent);
    const slug = filename.replace(".md", "");

    const title =
      typeof data.title === "string" ? data.title : "Untitled";
    const date =
      typeof data.date === "string"
        ? data.date
        : new Date().toISOString().slice(0, 10);
    const tags = Array.isArray(data.tags)
      ? data.tags.map(String)
      : typeof data.tags === "string"
        ? [data.tags]
        : [];

    return {
      slug,
      title,
      date,
      tags,
      content: content.trim(),
      preview: generatePreview(content),
      audio: getAudioUrl(slug),
    };
  });

  return posts.sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );
}

export async function getPostBySlug(slug: string): Promise<BlogPost | null> {
  const contentDir = path.join(process.cwd(), "src/content/blog");
  const filePath = path.join(contentDir, `${slug}.md`);

  try {
    if (!fs.existsSync(filePath)) {
      return null;
    }

    const fileContent = fs.readFileSync(filePath, "utf8");
    const { data, content } = matter(fileContent);

    const title =
      typeof data.title === "string" ? data.title : "Untitled";
    const date =
      typeof data.date === "string"
        ? data.date
        : new Date().toISOString().slice(0, 10);
    const tags = Array.isArray(data.tags)
      ? data.tags.map(String)
      : typeof data.tags === "string"
        ? [data.tags]
        : [];

    return {
      slug,
      title,
      date,
      tags,
      content: content.trim(),
      preview: generatePreview(content),
      audio: getAudioUrl(slug),
    };
  } catch {
    return null;
  }
}
