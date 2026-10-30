---
title: "How to enable any LLM from ⌥ + space on your Mac?"
date: "2025-04-19"
tags: ["LLM", "Chat", "Raycast", "OpenRouter"]
---

I am using a lot of AI in my daily work. As a developer, but also in my work in general, I constantly interact with LLMs to get quick answers to technical questions, explanations or deep dives into certain topics. I want to keep my hands on the keyboard and stay in the flow, so I don't want to open my browser or another application for that.

ChatGPT's desktop app has made this incredibly convenient with its global shortcut `⌥ + space` (Option + Space). No matter what application you're in, it will present you with a chat interface floating over your current open windows, which is a game-changer for my productivity.

While this is useful, it is not possible to modify its behavior or call other LLMs (or agents) from this shortcut.

## Raycast
An app like [Raycast](https://www.raycast.com/) offers exactly this global shortcut functionality with a floating window, but then with more flexibility and customization options with its extendable architecture.

If you haven't already, I highly recommend installing Raycast. It offers better functionality than spotlight for most simple use cases (e.g. file search) and has a store with many plugings. It even comes with a lot of useful agentic AI if you want.

In the Raycast store, you can find the ChatGPT extension that let's you interact with the OpenAI API. Install it and open up the chat window by typing 'ask question'. This seems more work than the previously mentioned `⌥ + space` command, but within Raycast you can map any keyboard combination to any command, so you are free to choose your quick AI keyboard shortcut.

By default, the extension uses OpenAI's API endpoint. However, you can modify the base URL to point to any compatible API endpoint.

## OpenRouter
[OpenRouter](https://openrouter.ai/) is an OpenAI compatible proxy to basically any LLM available. It is very easy to use and you only need one account. There is no need to bring your own API keys and pay multiple providers.

In the ChatGPT extensions settings in Raycast, change the base URL to `https://openrouter.ai/api/v1` and enter your OpenRouter API key. Now when you ask a question, you can choose any model available on OpenRouter with `⌘ + p`.

### Self-hosted OpenWebUI
You can even take this one step further and enable any of your own agents or RAGs from this Raycast window by connecting it to your OpenWebUI instance.

If you're running your own OpenWebUI instance (as described in my [previous post](/blog/openwebui)), you can point Raycast to your deployment:

1. In the extension settings, change the API Base URL to your OpenWebUI instance:
   ```
   https://your-openwebui-instance.com/v1
   ```
2. Use your OpenWebUI API key

This setup allows you to:
- Use your private RAG endpoints (e.g. access company-specific knowledge bases)
- Keep sensitive queries within your infrastructure
