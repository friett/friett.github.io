---
title: "Setting Up Smolagents with OpenWebUI"
date: "2025-03-12"
tags: ["AI", "Open Source", "OpenWebUI", "Smolagents"]
---

HuggingFace's Smolagents is a lightweight framework for building AI agents that can reason through problems step by step. It provides simple ways to create agents that can think, solve problems, and interact with users through natural language.

While Smolagents offers powerful capabilities for creating AI assistants, it doesn't come with built-in integration pathways to user interfaces or other applications. This is where creating an OpenAI-compatible API wrapper becomes valuable, acting as a bridge between Smolagents and the ecosystem of tools built for OpenAI's API format.

Creating an OpenAI-compatible API wrapper for Smolagents enables:

- Integration with any tool or UI that supports OpenAI's API
- Leveraging existing community-built interfaces like OpenWebUI
- Using standard OpenAI client libraries in various programming languages
- Seamlessly switching between different AI models behind the same API
- Building on established patterns for authentication and request handling

## How to do this?

### 1. Create an OpenAI-Compatible API Server

The server needs to implement two main endpoints:
- `POST /v1/chat/completions` - For creating chat completions
- `GET /v1/models` - For listing available models

Here's a basic implementation approach:

```python
from fastapi import FastAPI, Request
from fastapi.responses import StreamingResponse
import json
import asyncio
from smolagent import Agent

app = FastAPI()
agent = Agent()  # Initialize your smolagent

@app.get("/v1/models")
async def list_models():
    return {
        "object": "list",
        "data": [
            {
                "id": "default",
                "object": "model",
                "created": 1677610602,
                "owned_by": "organization-owner"
            }
        ]
    }

@app.post("/v1/chat/completions")
async def create_chat_completion(request: Request):
    body = await request.json()
    messages = body.get("messages", [])
    stream = body.get("stream", False)
    
    # Convert OpenAI format to smolagent format
    user_message = next((m["content"] for m in messages if m["role"] == "user"), "")
    
    if stream:
        return StreamingResponse(
            stream_response(user_message),
            media_type="text/event-stream"
        )
    else:
        response = agent.chat(user_message)
        return format_response(response)

async def stream_response(user_message):
    for chunk in agent.stream_chat(user_message):
        yield f"data: {json.dumps(format_chunk(chunk))}\n\n"
    yield "data: [DONE]\n\n"
```

### 2. Connecting to OpenWebUI

To connect your Smolagents API to OpenWebUI:

- Go to Admin Settings > Connections
- Add a new OpenAI connection:
  - Base URL: `http://host.docker.internal:8000/v1` (for Docker) or `http://localhost:8000/v1` (for local)
  - API key: `anything` (the API key is ignored in this implementation)
- Save the connection
- Select your agent from the available models dropdown

### 3. Testing with Python Client

```python
from openai import OpenAI

client = OpenAI(
    api_key="dummy",
    base_url="http://localhost:8000/v1"
)

# Test non-streaming
response = client.chat.completions.create(
    model="default",
    messages=[
        {"role": "user", "content": "What is 2+2?"}
    ]
)
print(response.choices[0].message.content)

# Test streaming
stream = client.chat.completions.create(
    model="default",
    messages=[
        {"role": "user", "content": "Write a short poem"}
    ],
    stream=True
)
for chunk in stream:
    print(chunk.choices[0].delta.content or "", end="")
```

## Implementation Notes

- The wrapper translates between OpenAI's API format and Smolagents format
- Both streaming and non-streaming responses are supported
- Docker networking requires using `host.docker.internal` to access the host
- Model name is required by the OpenAI client but can be ignored in your implementation

This approach works with any OpenAI-compatible client or interface, not just OpenWebUI.
