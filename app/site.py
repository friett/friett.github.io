from app.models import Project, Site, SkillGroup, Tool

HOME_TITLE = "Fried Schölvinck | AI Engineer and Coldfinch Founder"
HOME_DESCRIPTION = (
    "Fried Schölvinck is an AI engineer in Amsterdam and founder of Coldfinch. "
    "Selected work includes production AI systems, custom software and data products."
)

SITE = Site(
    name="Fried Schölvinck",
    role="AI Engineer",
    location="Amsterdam",
    github="https://github.com/friett",
    linkedin="https://www.linkedin.com/in/fried-scholvinck/",
    phrases=[
        "AI solutions",
        "useful agents",
        "web applications",
        "REST APIs",
        "data pipelines",
        "custom ML models",
        "advanced analytics dashboards",
        "websites",
    ],
    bio=[
        (
            "I am a driven and all-round Machine Learning Engineer with a deep "
            "specialization in Generative AI. I excel at overseeing and executing "
            "the entire end-to-end process of AI projects, from initial concept and "
            "strategy to the final implementation of robust, scalable solutions."
        ),
        (
            "I have hands-on experience leading innovative AI projects, such as "
            "migrating business-critical systems to advanced agentic frameworks. I "
            "naturally take ownership and am proactive in understanding and solving "
            "problems."
        ),
        (
            "As a strong communicator, I bridge the gap between technology and "
            "business. I can clearly explain complex topics to various stakeholders "
            "and act as a unifying factor in teams. My proactive attitude and "
            "strategic insight, demonstrated in my role as GenAI Lead, make me a "
            "valuable sparring partner who contributes to the commercial and "
            "business impact of AI."
        ),
    ],
    skills=[
        SkillGroup(
            category="Software Development",
            items=[
                "Advanced Python",
                "FastAPI",
                "PyTorch",
                "Transformers",
                "LangGraph",
                "Smolagents",
                "Polars",
                "Databricks",
                "Streamlit",
                "Marimo",
                "AWS",
                "Azure",
                "GCP",
                "Docker",
                "Github",
                "Gitlab",
                "Dokploy",
                "Vercel",
                "Netlify",
                "Supabase",
                "Opensearch",
            ],
        ),
        SkillGroup(
            category="Consulting",
            items=[
                "AI Strategy",
                "Project Planning & Management",
                "Software Architecture",
                "MLOps Best Practices",
                "Technical Communication",
                "API Design",
            ],
        ),
    ],
    projects=[
        Project(
            title="Coldfinch",
            eyebrow="My company",
            description=(
                "Managed open-source software and custom business applications, "
                "built and operated from the Netherlands."
            ),
            tags=["Product", "Open Source", "Custom Software", "EU Hosting"],
            date="2025 - Present",
            link="https://coldfinch.eu",
            preview="https://coldfinch.eu",
            featured=True,
        ),
        Project(
            title="Momberger Airport Information",
            eyebrow="Built by Coldfinch",
            description=(
                "A B2B intelligence and newsletter platform for the global airport "
                "industry, with editorial workflows and automated data ingestion."
            ),
            tags=["Next.js", "Supabase", "Data ingestion", "Email"],
            date="2026",
            link="https://momberger.app",
            preview="https://momberger.app",
            featured=True,
        ),
        Project(
            title="Huib Luns",
            eyebrow="Built by Coldfinch",
            description=(
                "A digital archive and portfolio for the work of Dutch painter, "
                "writer and educator Huib Luns."
            ),
            tags=["React", "Digital archive", "Supabase", "Netlify"],
            date="2025",
            link="https://huibluns.nl",
            preview="https://huibluns.nl",
            featured=True,
        ),
        Project(
            title="Machine Learning Engineer at Xomnia",
            description=(
                "Leading AI agency in the Netherlands. I focus on generative and "
                "agentic AI."
            ),
            tags=[
                "Consulting",
                "Machine Learning",
                "GenAI",
                "Agentic AI",
                "Data Engineering",
            ],
            date="2020 - Present",
            highlights=[
                (
                    "AI Engineer for [Vodafone Ziggo]"
                    "(https://xomnia.com/vodafoneziggo-boosts-its-customer-service-with-generative-ai/)"
                    "'s customer service AI products"
                ),
                "Churn prediction, marketing mix modelling, and more",
                "Air traffic control, fraud detection, and more",
            ],
            link="https://xomnia.com",
        ),
        Project(
            title="CatFinder",
            description=(
                "Custom facial recognition model to reunite lost cats with their "
                "owners."
            ),
            tags=[
                "Computer Vision",
                "PyTorch",
                "Vector Embeddings",
                "Docker",
                "Azure",
            ],
            date="2022",
        ),
        Project(
            title="AI Startup Lab",
            description=(
                "An AI tool developed with ABN AMRO to predict and visualise "
                "household solar energy supply and demand."
            ),
            tags=["Machine Learning", "Energy", "Visualisation", "Entrepreneurship"],
            date="2020",
        ),
    ],
    tools=[
        Tool(
            name="Arc Browser",
            icon="/icons/arc.svg",
            description="My daily driver browser, love the spaces!",
            url="https://arc.net/",
        ),
        Tool(
            name="Raycast",
            icon="/icons/raycast.svg",
            description="Supercharged productivity launcher.",
            url="https://www.raycast.com/",
        ),
        Tool(
            name="Ghostty",
            icon="/icons/ghostty.svg",
            description="Fast, native, and beautiful terminal.",
            url="https://github.com/ghostty-org/ghostty",
        ),
        Tool(
            name="Cursor",
            icon="/icons/cursor.svg",
            description="The AI-first code editor I'm using right now.",
            url="https://cursor.sh/",
        ),
        Tool(
            name="Neovim",
            icon="/icons/neovim.svg",
            description="My go-to for quick edits and config files.",
            url="https://neovim.io/",
        ),
        Tool(
            name="lazygit",
            icon="/icons/lazygit.svg",
            description="Makes Git delightful in the terminal.",
            url="https://github.com/jesseduffield/lazygit",
        ),
        Tool(
            name="lazydocker",
            icon="/icons/lazydocker.svg",
            description="Taming Docker containers with ease.",
            url="https://github.com/jesseduffield/lazydocker",
        ),
    ],
)


def person_json_ld(public_url: str) -> dict[str, object]:
    # The live profile. Imported here: app.content imports SITE from this module.
    from app.content import load_site

    site = load_site()
    return {
        "@context": "https://schema.org",
        "@type": "Person",
        "@id": f"{public_url}/#person",
        "name": site.name,
        "url": f"{public_url}/",
        "jobTitle": site.role,
        "homeLocation": {"@type": "Place", "name": "Amsterdam, Netherlands"},
        "worksFor": {
            "@type": "Organization",
            "name": "Xomnia",
            "url": "https://xomnia.com/",
        },
        "founder": {
            "@type": "Organization",
            "name": "Coldfinch",
            "url": "https://coldfinch.eu/",
        },
        "knowsAbout": [
            "Artificial intelligence",
            "Machine learning",
            "Generative AI",
            "AI agents",
            "Data engineering",
            "Custom software development",
        ],
        "sameAs": [site.github, site.linkedin],
    }


def post_json_ld(
    public_url: str,
    title: str,
    date_text: str,
    preview: str,
    slug: str,
) -> dict[str, object]:
    url = f"{public_url}/blog/{slug}"
    return {
        "@context": "https://schema.org",
        "@type": "BlogPosting",
        "headline": title,
        "datePublished": date_text,
        "description": preview,
        "url": url,
        "mainEntityOfPage": url,
        "author": {"@type": "Person", "name": SITE.name, "url": f"{public_url}/"},
    }
