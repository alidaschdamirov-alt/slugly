import { useAuth } from "@/_core/hooks/useAuth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useTheme } from "@/contexts/ThemeContext";
import { LayoutDashboard, Globe, CreditCard, Plus, LogOut, Moon, Sun, Tag, QrCode, Shield, Lock, Users, FileText, Menu, X } from "lucide-react";
import NotificationBell from "./NotificationBell";
import { useState } from "react";
import { useLocation } from "wouter";
import WorkspaceSwitcher from "./WorkspaceSwitcher";

const navItems = [
  { icon: LayoutDashboard, label: "Projects", path: "/dashboard" },
  { icon: Plus, label: "Create Link", path: "/create" },
  { icon: QrCode, label: "QR Codes", path: "/qr" },
  { icon: Tag, label: "Tags", path: "/tags" },
  { icon: Globe, label: "Domains", path: "/domains" },
  { icon: Users, label: "Team", path: "/team" },
  { icon: FileText, label: "Reports", path: "/export-report" },
  { icon: CreditCard, label: "Billing", path: "/billing" },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const { theme, toggleTheme } = useTheme();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navigateTo = (path: string) => {
    setLocation(path);
    setMobileMenuOpen(false);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Top navigation */}
      <header className="border-b bg-background/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container flex items-center justify-between h-14">
          <div className="flex items-center gap-4">
            {/* Mobile burger menu */}
            <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="lg:hidden h-8 w-8">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72 p-0">
                <div className="flex flex-col h-full">
                  {/* Mobile menu header */}
                  <div className="flex items-center gap-3 p-4 border-b">
                    <img src="/assets/slugly-logo.svg" alt="Slugly" className="w-7 h-7" />
                    <span className="font-[800] text-[16px] tracking-[-0.5px]" style={{ fontFamily: "'Bricolage Grotesque'" }}>Slugly</span>
                  </div>

                  {/* Workspace switcher */}
                  <div className="p-3 border-b">
                    <WorkspaceSwitcher />
                  </div>

                  {/* Navigation items */}
                  <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
                    {navItems.map(item => {
                      const isActive = location === item.path || (item.path === "/dashboard" && location.startsWith("/project")) || (item.path === "/tags" && location.startsWith("/tags")) || (item.path === "/team" && location.startsWith("/team"));
                      return (
                        <button
                          key={item.path}
                          onClick={() => navigateTo(item.path)}
                          className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${
                            isActive
                              ? "bg-accent text-accent-foreground"
                              : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                          }`}
                        >
                          <item.icon className="h-4 w-4" />
                          {item.label}
                        </button>
                      );
                    })}
                  </nav>

                  {/* Mobile menu footer */}
                  <div className="border-t p-3 space-y-1">
                    <button
                      onClick={() => navigateTo("/privacy-settings")}
                      className="flex items-center gap-3 w-full px-3 py-2 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-accent/50"
                    >
                      <Lock className="h-4 w-4" />
                      Privacy & Data
                    </button>
                    {user?.role === "admin" && (
                      <button
                        onClick={() => navigateTo("/admin")}
                        className="flex items-center gap-3 w-full px-3 py-2 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-accent/50"
                      >
                        <Shield className="h-4 w-4" />
                        Admin Panel
                      </button>
                    )}
                    <button
                      onClick={() => { logout(); setMobileMenuOpen(false); }}
                      className="flex items-center gap-3 w-full px-3 py-2 rounded-md text-sm text-destructive hover:bg-destructive/10"
                    >
                      <LogOut className="h-4 w-4" />
                      Sign out
                    </button>
                  </div>
                </div>
              </SheetContent>
            </Sheet>

            <div className="flex items-center gap-[11px] cursor-pointer" onClick={() => setLocation("/dashboard")}>
              <img src="/assets/slugly-logo.svg" alt="Slugly" className="w-[30px] h-[30px]" />
              <span className="font-[800] text-[18px] tracking-[-0.5px] hidden sm:inline" style={{ fontFamily: "'Bricolage Grotesque'" }}>Slugly</span>
            </div>
            <div className="hidden lg:block border-l pl-3 ml-1">
              <WorkspaceSwitcher />
            </div>
            <nav className="hidden lg:flex items-center gap-1">
              {navItems.map(item => {
                const isActive = location === item.path || (item.path === "/dashboard" && location.startsWith("/project")) || (item.path === "/tags" && location.startsWith("/tags")) || (item.path === "/team" && location.startsWith("/team"));
                return (
                  <button
                    key={item.path}
                    onClick={() => setLocation(item.path)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                      isActive
                        ? "bg-accent text-accent-foreground"
                        : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                    }`}
                  >
                    <item.icon className="h-4 w-4" />
                    {item.label}
                  </button>
                );
              })}
            </nav>
          </div>
          <div className="flex items-center gap-2">
            <NotificationBell />
            <Button variant="ghost" size="icon" onClick={toggleTheme} className="h-8 w-8">
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <Avatar className="h-8 w-8 border">
                    <AvatarFallback className="text-xs font-medium bg-primary/10 text-primary">
                      {user?.name?.charAt(0).toUpperCase() || "U"}
                    </AvatarFallback>
                  </Avatar>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <div className="px-2 py-1.5">
                  <p className="text-sm font-medium">{user?.name}</p>
                  <p className="text-xs text-muted-foreground">{user?.email}</p>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setLocation("/privacy-settings")}>
                  <Lock className="mr-2 h-4 w-4" />
                  Privacy & Data
                </DropdownMenuItem>
                {user?.role === "admin" && (
                  <DropdownMenuItem onClick={() => setLocation("/admin")}>
                    <Shield className="mr-2 h-4 w-4" />
                    Admin Panel
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={logout} className="text-destructive focus:text-destructive">
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="container py-6">
        {children}
      </main>
    </div>
  );
}
