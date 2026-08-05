
import { Github, Linkedin } from "lucide-react";

export default function Footer() {
  return (
    <footer className="section-padding">
      <div className="container flex flex-col md:flex-row items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">© 2026 Fried. All rights reserved.</p>
        <div className="flex items-center gap-4">
          <a href="https://github.com/friett" target="_blank" rel="noopener noreferrer" 
             className="p-2 hover:bg-secondary rounded-full transition-colors">
            <Github className="w-5 h-5" />
          </a>
          <a href="https://www.linkedin.com/in/fried-scholvinck/" target="_blank" rel="noopener noreferrer"
             className="p-2 hover:bg-secondary rounded-full transition-colors">
            <Linkedin className="w-5 h-5" />
          </a>
        </div>
      </div>
    </footer>
  );
}
