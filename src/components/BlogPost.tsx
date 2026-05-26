import { useParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import Header from './Header';
import { Badge } from './ui/badge';
import { Clock, Headphones } from 'lucide-react';
import { postsBySlug } from 'virtual:blog-posts';
import { useEffect, useState } from 'react';

const BlogGraphic = () => (
  <div className="w-full h-64 bg-gradient-to-br from-secondary to-secondary/30 rounded-lg flex items-center justify-center mb-8">
    <svg width="120" height="120" viewBox="0 0 120 120" className="text-primary/80">
      <g transform="translate(60,60)">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <g key={i} transform={`rotate(${i * 60})`}>
            <circle 
              cx="0" 
              cy="-30" 
              r="5" 
              fill="currentColor" 
              opacity={0.8}
              className="animate-pulse"
            />
            <line
              x1="0"
              y1="-25"
              x2="0"
              y2="0"
              stroke="currentColor"
              strokeWidth="2"
              strokeDasharray="4 2"
            />
            <path
              d={`M -8,-40 Q 0,-45 8,-40`}
              stroke="currentColor"
              fill="none"
              strokeWidth="1.5"
            />
          </g>
        ))}
        <circle cx="0" cy="0" r="10" fill="currentColor">
          <animate 
            attributeName="r" 
            values="8;12;8" 
            dur="3s" 
            repeatCount="indefinite" 
          />
        </circle>
        <circle cx="0" cy="0" r="16" fill="none" stroke="currentColor" strokeWidth="1" strokeDasharray="3 3" />
      </g>
    </svg>
  </div>
);

export default function BlogPost() {
  const { slug } = useParams<{ slug: string }>();
  const [notFound, setNotFound] = useState(false);
  const [imageError, setImageError] = useState<Record<string, boolean>>({});
  
  useEffect(() => {
    if (slug && !postsBySlug[slug]) {
      setNotFound(true);
    }
  }, [slug]);

  if (!slug || notFound) {
    return (
      <>
        <Header />
        <div className="min-h-screen pt-24">
          <div className="container max-w-3xl mx-auto px-6">
            <h1 className="text-4xl font-bold mb-4 playfair">Post Not Found</h1>
            <p>The blog post you're looking for doesn't exist.</p>
          </div>
        </div>
      </>
    );
  }

  const post = postsBySlug[slug];
  const { title, date, tags, content, audio } = post;

  const handleImageError = (src: string) => {
    setImageError(prev => ({ ...prev, [src]: true }));
  };

  return (
    <>
      <Header />
      <div className="min-h-screen pt-24" id="top">
        <div className="container max-w-3xl mx-auto px-6">
          <div className="mb-8">
            <div className="flex gap-2 mb-4">
              {tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="text-sm">
                  {tag}
                </Badge>
              ))}
            </div>
            <h1 className="text-4xl font-bold mb-4 playfair">{title}</h1>
            <div className="flex items-center gap-2 text-muted-foreground">
              <Clock className="w-4 h-4" />
              <time>{date}</time>
            </div>
          </div>
          
          <BlogGraphic />

          {audio && (
            <div className="mb-8 rounded-lg border border-border bg-secondary/40 p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <Headphones className="h-4 w-4" />
                Listen to this post
              </div>
              <audio controls preload="metadata" className="w-full">
                <source src={audio} type="audio/mpeg" />
              </audio>
            </div>
          )}

          <article className="prose prose-lg max-w-none dark:prose-invert prose-img:rounded-lg prose-img:shadow-md">
            <ReactMarkdown
              components={{
                img: ({ node, src, alt, ...props }) => {
                  const safeSrc =
                    src && !/^\s*javascript:/i.test(src) ? src : undefined;
                  if (!safeSrc || imageError[safeSrc]) {
                    return (
                      <div className="flex items-center justify-center border border-dashed border-gray-300 rounded-lg p-4 my-6 bg-gray-50 dark:bg-gray-800 dark:border-gray-700">
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          Image not found: {alt}
                        </p>
                      </div>
                    );
                  }
                  return (
                    <figure className="my-8">
                      <img
                        src={safeSrc}
                        alt={alt || "Blog image"}
                        className="rounded-lg w-full max-w-full shadow-md object-cover"
                        loading="lazy"
                        onError={() => handleImageError(safeSrc)}
                        {...props}
                      />
                      {alt && alt !== "Blog image" && (
                        <figcaption className="text-center text-sm text-gray-500 dark:text-gray-400 mt-2">
                          {alt}
                        </figcaption>
                      )}
                    </figure>
                  );
                },
                a: ({ node, href, children, ...props }) => {
                  const safeHref =
                    href &&
                    !/^\s*javascript:/i.test(href) &&
                    !/^\s*data:/i.test(href)
                      ? href
                      : "#";
                  return (
                    <a
                      href={safeHref}
                      target={safeHref.startsWith("http") ? "_blank" : undefined}
                      rel={
                        safeHref.startsWith("http")
                          ? "noopener noreferrer"
                          : undefined
                      }
                      className="text-primary hover:text-primary/80 underline underline-offset-4"
                      {...props}
                    >
                      {children}
                    </a>
                  );
                },
              }}
            >
              {content}
            </ReactMarkdown>
          </article>
        </div>
      </div>
    </>
  );
}
