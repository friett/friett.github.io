import { Github, Linkedin } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { ThemeToggle } from "@/components/ui/theme-toggle";

export default function Header() {
  const location = useLocation();

  const scrollToSection = (sectionId: string) => {
    // If we're not on the homepage, navigate there first
    if (location.pathname !== '/') {
      window.location.href = `/${sectionId}`;
      return;
    }

    // If we're already on the homepage, scroll to the section
    const element = document.getElementById(sectionId.replace('#', ''));
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <header className="fixed top-0 w-full bg-transparent z-50">
      <div className="container flex items-center justify-between h-16">
        <Link to="/" className="playfair text-xl font-medium">Fried.</Link>
        <nav className="hidden md:flex items-center gap-8">
          <button 
            onClick={() => scrollToSection('#skills')} 
            className="text-sm hover:text-primary/80 transition-colors"
          >
            Skills
          </button>
          <button 
            onClick={() => scrollToSection('#projects')} 
            className="text-sm hover:text-primary/80 transition-colors"
          >
            Projects
          </button>
          <button 
            onClick={() => scrollToSection('#blog')} 
            className="text-sm hover:text-primary/80 transition-colors"
          >
            Blog
          </button>
          <button 
            onClick={() => scrollToSection('#tools-section')} 
            className="text-sm hover:text-primary/80 transition-colors"
          >
            Tools 
          </button>
        </nav>
        <div className="flex items-center gap-4">
          <ThemeToggle />
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
    </header>
  );
}
