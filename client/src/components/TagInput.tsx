import { useState, useRef, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { X } from "lucide-react";

interface TagInputProps {
  value: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
}

export default function TagInput({ value, onChange, placeholder = "Add tags..." }: TagInputProps) {
  const [input, setInput] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const { data: existingTags } = trpc.tag.list.useQuery(undefined, {
    staleTime: 30_000,
  });

  const suggestions = existingTags
    ?.map(t => t.tag)
    .filter(t => !value.includes(t) && t.toLowerCase().includes(input.toLowerCase()))
    .slice(0, 5) ?? [];

  const addTag = (tag: string) => {
    const trimmed = tag.trim().toLowerCase();
    if (trimmed && !value.includes(trimmed)) {
      onChange([...value, trimmed]);
    }
    setInput("");
    setShowSuggestions(false);
    inputRef.current?.focus();
  };

  const removeTag = (tag: string) => {
    onChange(value.filter(t => t !== tag));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      if (input.trim()) addTag(input);
    } else if (e.key === "Backspace" && !input && value.length > 0) {
      removeTag(value[value.length - 1]);
    }
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <div className="flex flex-wrap gap-1.5 p-2 border rounded-md bg-background min-h-[38px] focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
        {value.map(tag => (
          <Badge key={tag} variant="secondary" className="text-xs gap-1 pr-1">
            {tag}
            <button
              type="button"
              onClick={() => removeTag(tag)}
              className="ml-0.5 rounded-full hover:bg-muted-foreground/20 p-0.5"
            >
              <X className="h-2.5 w-2.5" />
            </button>
          </Badge>
        ))}
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => { setInput(e.target.value); setShowSuggestions(true); }}
          onFocus={() => setShowSuggestions(true)}
          onKeyDown={handleKeyDown}
          placeholder={value.length === 0 ? placeholder : ""}
          className="flex-1 min-w-[80px] bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>
      {showSuggestions && input && suggestions.length > 0 && (
        <div className="absolute z-50 mt-1 w-full bg-popover border rounded-md shadow-md py-1 max-h-[150px] overflow-y-auto">
          {suggestions.map(tag => (
            <button
              key={tag}
              type="button"
              onClick={() => addTag(tag)}
              className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground transition-colors"
            >
              {tag}
            </button>
          ))}
        </div>
      )}
      <p className="text-[10px] text-muted-foreground mt-1">Press Enter or comma to add a tag</p>
    </div>
  );
}
