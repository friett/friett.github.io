import { useState } from "react";
import { ArrowUpRight, Building2 } from "lucide-react";
import ReactMarkdown from "react-markdown";

type Project = {
  title: string;
  description: string;
  tags: string[];
  date: string;
  link?: string;
  preview?: string;
  featured?: boolean;
  eyebrow?: string;
  highlights?: string[];
};

const projects: Project[] = [
  {
    title: "Coldfinch",
    eyebrow: "My company",
    description: "Managed open-source software and custom business applications, built and operated from the Netherlands.",
    tags: ["Product", "Open Source", "Custom Software", "EU Hosting"],
    date: "2025 - Present",
    link: "https://coldfinch.eu",
    preview: "https://coldfinch.eu",
    featured: true,
  },
  {
    title: "Momberger Airport Information",
    eyebrow: "Built by Coldfinch",
    description: "A B2B intelligence and newsletter platform for the global airport industry, with editorial workflows and automated data ingestion.",
    tags: ["Next.js", "Supabase", "Data ingestion", "Email"],
    date: "2026",
    link: "https://momberger.app",
    preview: "https://momberger.app",
    featured: true,
  },
  {
    title: "Huib Luns",
    eyebrow: "Built by Coldfinch",
    description: "A digital archive and portfolio for the work of Dutch painter, writer and educator Huib Luns.",
    tags: ["React", "Digital archive", "Supabase", "Netlify"],
    date: "2025",
    link: "https://huibluns.nl",
    preview: "https://huibluns.nl",
    featured: true,
  },
  {
    title: "Machine Learning Engineer at Xomnia",
    description: "Leading AI agency in the Netherlands. I focus on generative and agentic AI.",
    tags: ["Consulting", "Machine Learning", "GenAI", "Agentic AI", "Data Engineering"],
    date: "2020 - Present",
    highlights: [
      "AI Engineer for [VodafoneZiggo](https://xomnia.com/vodafoneziggo-boosts-its-customer-service-with-generative-ai/)'s customer service AI products",
      "Churn prediction, marketing mix modelling, and more",
      "Air traffic control, fraud detection, and more",
    ],
    link: "https://xomnia.com",
  },
  {
    title: "CatFinder",
    description: "Custom facial recognition model to reunite lost cats with their owners.",
    tags: ["Computer Vision", "PyTorch", "Vector Embeddings", "Docker", "Azure"],
    date: "2022",
  },
  {
    title: "AI Startup Lab",
    description: "An AI tool developed with ABN AMRO to predict and visualise household solar energy supply and demand.",
    tags: ["Machine Learning", "Energy", "Visualisation", "Entrepreneurship"],
    date: "2020",
  },
];

function BrowserPreview({ project }: { project: Project }) {
  const [active, setActive] = useState(false);

  return (
    <div className="relative aspect-[16/10] overflow-hidden rounded-xl border border-border bg-muted">
      <div className="flex h-9 items-center gap-1.5 border-b border-border bg-background px-3">
        <span className="h-2 w-2 rounded-full bg-muted-foreground/30" />
        <span className="h-2 w-2 rounded-full bg-muted-foreground/30" />
        <span className="h-2 w-2 rounded-full bg-muted-foreground/30" />
        <span className="ml-2 truncate text-[10px] text-muted-foreground">{project.link?.replace("https://", "")}</span>
      </div>
      {active && project.preview ? (
        <iframe src={project.preview} title={`${project.title} live preview`} className="h-[calc(100%-2.25rem)] w-full bg-white" loading="lazy" sandbox="allow-forms allow-scripts allow-same-origin allow-popups" />
      ) : (
        <button type="button" onClick={() => setActive(true)} className="flex h-[calc(100%-2.25rem)] w-full flex-col items-center justify-center gap-3 bg-gradient-to-br from-secondary to-background px-6 text-center transition-colors hover:from-primary/10">
          <Building2 className="h-8 w-8 text-primary" />
          <span className="font-medium">Load live preview</span>
          <span className="text-xs text-muted-foreground">Interactive website embedded here</span>
        </button>
      )}
    </div>
  );
}

export default function Projects() {
  const featured = projects.filter((project) => project.featured);
  const other = projects.filter((project) => !project.featured);

  return (
    <section id="projects" className="section-padding">
      <div className="container">
        <div className="animate-on-scroll">
          <h2 className="heading">💼 Work & projects</h2>
          <p className="subheading">Products and systems I have built through Coldfinch and in my work as an AI engineer.</p>
        </div>

        <div className="mt-12 space-y-8">
          {featured.map((project) => (
            <article key={project.title} className="animate-on-scroll grid gap-6 rounded-2xl border border-border bg-card p-5 text-left shadow-sm lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:p-8">
              <BrowserPreview project={project} />
              <div className="lg:px-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">{project.eyebrow}</p>
                <div className="mt-3 flex items-start justify-between gap-4">
                  <h3 className="text-2xl font-semibold tracking-tight">{project.title}</h3>
                  <span className="shrink-0 text-sm text-muted-foreground">{project.date}</span>
                </div>
                <p className="mt-4 leading-7 text-muted-foreground">{project.description}</p>
                <div className="mt-6 flex flex-wrap gap-2">
                  {project.tags.map((tag) => <span key={tag} className="rounded-full bg-secondary px-3 py-1 text-xs">{tag}</span>)}
                </div>
                {project.link && (
                  <a href={project.link} target="_blank" rel="noopener noreferrer" className="mt-7 inline-flex items-center gap-2 font-medium text-primary no-underline hover:underline">
                    Open live site <ArrowUpRight className="h-4 w-4" />
                  </a>
                )}
              </div>
            </article>
          ))}
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          {other.map((project) => (
            <article key={project.title} className="animate-on-scroll rounded-2xl border border-border bg-card p-6 text-left">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-lg font-medium">{project.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{project.description}</p>
                </div>
                <span className="shrink-0 text-sm text-muted-foreground">{project.date}</span>
              </div>
              {project.highlights && (
                <ul className="mt-5 list-inside list-disc space-y-1 text-sm text-muted-foreground">
                  {project.highlights.map((highlight) => (
                    <li key={highlight}>
                      <ReactMarkdown components={{
                        a: ({ node: _node, ...props }) => <a {...props} className="font-medium text-primary/80 transition-colors hover:text-primary" target="_blank" rel="noopener noreferrer" />,
                        p: ({ node: _node, ...props }) => <>{props.children}</>,
                      }}>{highlight}</ReactMarkdown>
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-5 flex flex-wrap gap-2">
                {project.tags.map((tag) => <span key={tag} className="rounded-full bg-secondary px-2 py-1 text-xs">{tag}</span>)}
              </div>
              {project.link && (
                <a href={project.link} target="_blank" rel="noopener noreferrer" className="mt-5 inline-flex items-center gap-1 text-sm font-medium text-primary no-underline hover:underline">
                  Visit <ArrowUpRight className="h-3.5 w-3.5" />
                </a>
              )}
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
