---
title: "Bringing your vibe-coded AI app to production: a simple blueprint for internal deployment"
date: "2026-05-27"
tags: ["Dokploy", "Docker", "FastAPI", "Deployment", "AI", "Open Source"]
---

Modern AI tools have democratized software creation. With the concept of 'vibe coding' maturing to 'agentic engineering' and some powerful new plugins (or skills, MCP tools and CLIs), full-stack development is now accessible to a much wider audience than before. It seems as though anyone can create useful (simple) applications for private or company use. Tools like Lovable show just how easy it is to take an idea from your mind into a functional Proof of Concept. This can include a persistent database, payments and even AI integration, for free.

But what happens when you want to move beyond the PoC phase and actually deploy your application across your company? The challenge shifts from rapid prototyping to making the right architectural choices up front. What design choices do you make so your coding agent (or you, the developer) starts with the right tools to get the job done right and actually serve your idea to your colleagues? This blog post is a simple blueprint, outlining an open source stack and key design choices that will work for most ideas, ensuring your internal tools are built on a solid foundation that is easy to maintain and expand.

## TL;DR

This stack closes the gap between local development and production deployment in a cloud-agnostic way.

- **Backend:** FastAPI + SQLModel
- **Frontend:** Vite + React + Tailwind + shadcn/ui
- **Database:** PostgreSQL
- **Docker Compose** for local development and deployment
- **Dokploy** for containerized deployments on VPS
- **Authentication:** (Google) OAuth/SSO via FastAPI (domain-restricted)
- **Agents:** Pydantic AI
- **Observability:** Pydantic Logfire
- **LLMs:** OpenRouter (with zero-data-retention)

It is written for Python developers in the AI space: people who already write API services and need a database and web UI around their LLM flows and agents without becoming a full-stack developer.

## The objective of this stack

The primary goal is shipping a working full stack product, not chasing the newest framework. The objective is to use open source tools that are well-understood, allowing colleagues to pick up the project with a low learning ramp and not locking yourself into some proprietary framework or cloud deployment setup. To minimize engineering time, it is also wise to have the local development setup as close to the production deployment as possible.

AI experts and engineers, including ourselves and our clients, primarily work in Python. That is not because Python is technically the best language for that, but because there is a very rich ecosystem of people and libraries.

Therefore, building the backend in Python's most popular API library FastAPI is a wise choice. It also ensures the same language is used from the database layer through business logic to the AI agent, eliminating the need to translate types and patterns between runtimes.

## Frontend

Frontend frameworks are pre-written libraries of code that provide structure, tooling, and reusable components for building the user interface (UI) of a web application. They are essential for modern application development to manage complex state, handle client-side routing, and deliver a responsive, application-like experience in the browser. For a full-stack architecture where the Python backend (FastAPI) handles core business logic and data, the frontend's role is specifically focused on rendering the UI and managing user interaction. The choice between frameworks like Vite (leveraging modern build tools) and Next.js (a full-stack framework with server-side rendering capabilities) is critical, as it defines the boundary and complexity between the Python service and the JavaScript layer.

For Python developers building internal AI tools, the recommended frontend stack is Vite + React, not Next.js, because server-side rendering is unnecessary behind a login wall, and FastAPI already handles auth, streaming, and secrets. The browser still requires a JavaScript UI for application-like features such as client-side navigation and interactive panels. A frontend based on Vite provides a fast development loop and a small deploy surface. This choice helps maintain a clean boundary with the Python API, reinforcing the single-language approach for business logic and agents.

Next.js is often selected when teams require SEO, a BFF (Backend for Frontend) in the same repository, or specific patterns like Auth.js. However, for internal tools protected by SSO, the extra architectural layer is typically unnecessary.

Next.js also tends to introduce a steep learning curve. The framework forces you to navigate the complexities of Client versus Server components, alongside nuanced rendering choices like SSR, SSG, and ISR. Add in middleware, edge runtime constraints, and intricate caching rules, and the cognitive load quickly piles up. Also, every new release of Next.js seems to bring a major architectural shift. While this is great for innovation, it's not ideal for project stability and maintainability.

For basic use cases centered on dashboards or data-driven visuals, the emerging prefab-ui framework is worth noting. It enables you to develop the entire user interface within the Python ecosystem, where FastAPI routes deliver the frontend directly. This path offers more flexibility than tools like Streamlit while maintaining a professional aesthetic, as it is inspired by shadcn/ui components.

> Internal dashboard built on FastAPI and prefab-ui, very simple codebase with just Python.

## Database

PostgreSQL remains the default choice for internal platforms due to its handling of transactions, joins, and semi-structured fields via JSON columns. For applications requiring Retrieval-Augmented Generation (RAG), a Vector Database might be necessary as well, and can be easily deployed in the same database container via pgvector. It is critical to enforce RBAC (Role-Based Access Control) logic in the FastAPI application server before querying the vector store to gate access to underlying data sources.

Supabase and Appwrite (Supabase is what Lovable uses under the hood) are valid options for consolidating auth, database, and storage. However, when a separate FastAPI backend is already in place, these platforms may be redundant and require more resources. The FastAPI API should own the business logic, agent tools, and integrations, serving as the trust boundary for the application.

Lovable uses Supabase by default because their generated Vite frontends do not ship with a Python (or Node) application server in the box. The product needs somewhere to put data and auth, so Supabase stands in as the hosted backend: PostgREST (automatic REST API on top of your tables), Row Level Security and a lot of authentication options built-in. Once you already run a separate FastAPI backend, you do not need that substitute and you can use plain Postgres.

## Docker Compose

Docker Compose often functions as a local development tool, but works perfectly fine for internal production deployments as well. You define 3 containers: frontend, backend and database and serve the application in production as you would locally: `docker compose up -d`.

For the frontend image, you need a multi-stage Docker process. First, a Node.js build stage installs JavaScript dependencies and then uses Vite to compile the React code into optimized, static HTML, CSS, and JavaScript files. Vite itself does not run in a production container; instead, the final stage uses a minimal image (often Nginx) to serve these pre-built static assets. This static image serves as the 'frontend container' and keeps the deployment clean and separate from the Python/FastAPI container.

## Deployment: Dokploy and Compose versus cloud container services

Deployment is handled via the open source application [Dokploy](https://dokploy.com/) on a single VPS. Dokploy allows you to easily deploy docker compose stacks (with a Python backend) to the cloud with git integration. It works just like the popular Vercel, but then also for full-stack/python applications, in a cloud-agnostic setup. It works on top of Traefik, so you don't have to manage HTTPS encryption and certificates yourself. Just make sure you have access to a domain registry and its DNS settings to deploy the app on an internal domain (like `app.internal.company.com`).

An alternative workflow is to let your CI build images, push them to a container registry, then run them on Cloud Run, Azure Container Apps, App Runner, Fargate, or Kubernetes. That often fits larger teams or stricter compliance rules. For low traffic internal tools, one VM with docker compose installed is usually simpler and easier to predict in cost: you are not paying per request and cold starts the way many serverless container products bill. When you outgrow the VPS, you already have containers and can move them. Dokploy also offers more robust ways to scale your application if you really need to.

## AI Agents: Pydantic AI

Since you are a Python developer and are joining the agentic AI hype, you are likely going to integrate LLMs and agents into your app. Pydantic AI fits the stack because LLM inputs and outputs stay in the same Pydantic world as the rest of the app: tools and structured outputs are regular pydantic models.

For teams not utilizing the Pydantic ecosystem, other popular directions exist:

- **LangChain** (and LangGraph if you need more complex workflows) gives you a large set of patterns and integrations for popular tools, (vector) databases and LLM providers.
- **OpenAI Agents and ChatKit** (and the surrounding OpenAI platform pieces) solve the problem of product-grade chat and agent UX when you are happy to build on OpenAI's stack for orchestration and UI building blocks.

While there are many other options out there, the use of Pydantic AI is recommended because it maintains the smallest gap between the FastAPI code and the agent layer.

## Model routing and privacy

[OpenRouter](https://openrouter.ai/) provides a model-agnostic solution for trying multiple LLM providers behind a single API key and invoice. This allows for switching models without establishing commercial relationships with every vendor, or managing model deployments in e.g. Azure AI Foundry. As with any LLM provider, make sure you enable zero-data-retention. This ensures that your prompts are not stored at providers. In practice, this means that you can use any model (including open source) from any provider, only paying a 5% fee for the routing service. Some models (like xAI Grok) may not be available because the provider stores your data for analysis and/or training.

Hyperscaler offerings such as Azure AI Foundry, AWS Bedrock, or Google Vertex AI provide enterprise controls, but often at the cost of more administrative time regarding deployments, IAM, and rate limits. For a small internal platform, a gateway plus strict secret handling is often more efficient.

The Pydantic AI Gateway (integrated with Logfire) is another route if you want routing and billing next to the same traces you already send to Logfire.

## Observability

The LLM observability market is highly competitive, with a lot of open source and commercial options. For example, Pydantic and LangChain do not open source their observability tools, but have built their company around it. Other popular options are mlflow, langfuse, arize-phoenix, or the Dutch LangWatch. A practical approach is to select a product that easily integrates with the existing runtime, such as FastAPI and Pydantic AI. Logfire provides HTTP traces, agent spans, and validation context in a single system. In practice, most of these tools are built on top of OpenTelemetry (an open-source framework, governed by the Cloud Native Computing Foundation), which makes the integration fairly simple.

Some products also expose an MCP server and/or CLI so your coding agent can query production traces from the IDE, see [LangWatch skills for coding agents](https://langwatch.ai/blog/langwatch-skills-your-coding-agent-already-knows-how-to-test-your-agent).

## A tip for your frontend: maintain style consistency with Tailwind and shadcn/ui

For consistent frontend design, the combination of Tailwind and shadcn/ui is recommended. For someone who is not a frontend designer, you can think of Tailwind CSS as a way to design a web application's look and feel directly within the HTML code, without having to write separate style sheets.

Instead of creating a custom name like `btn-primary` and then defining its look (color, size, padding) in a separate file, Tailwind gives you a standardized, extensive vocabulary of small, pre-built keywords (like `bg-blue-500` for background color, `px-4` for horizontal padding, or `rounded-lg` for large rounded corners). You combine these keywords directly in the HTML to create the exact visual element you need, like assembling building blocks.

shadcn/ui is a collection of pre-built UI components (like buttons and forms) that look very minimalistic (and therefore beautiful). The components are copied directly into your project, giving you full ownership of the code. This means you can easily customize them to match your company's unique style without being locked into the predefined look. The pre-built look is often all you need though. Add this to your coding agent rules:

```
Use Tailwind and shadcn/ui. One primary color, neutral grays, rounded-xl cards, shadow-sm, max-w-5xl content width. Visible focus rings. No purple gradients or generic AI aesthetic.
```

## A note on compliance and security

Using open source tools like Dokploy comes with a security risk you have to take seriously. The deployment of security guardrails is a common way to mitigate these risks. For instance, you can run tools like `trivy` and `uv audit` in your CI/CD pipeline to scan public docker images and python dependencies for vulnerabilities. Dependabot is another useful tool that can automatically update dependencies in your code.

## Conclusion

Standardizing on this Python-centric, open-source stack provides a powerful value proposition for any organization looking to move beyond Proof of Concepts. By aligning the backend, database interactions, and agent logic within the same ecosystem, you reduce architectural friction and cognitive load for your engineering teams. This blueprint isn't just about technical choices; it's about ensuring long-term maintainability and speed. With documented defaults and shared patterns, new internal tools can be deployed with confidence, allowing your team to focus on building features that solve business problems rather than reinventing the infrastructure for every new project.
