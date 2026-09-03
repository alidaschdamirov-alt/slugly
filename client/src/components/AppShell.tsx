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
import {
  LayoutDashboard,
  Globe,
  CreditCard,
  Plus,
  LogOut,
  Moon,
  Sun,
  Tag,
  QrCode,
  Shield,
  ShieldCheck,
  Lock,
  Users,
  FileText,
  Menu,
  Package,
  LayoutTemplate,
} from "lucide-react";
import NotificationBell from "./NotificationBell";
import { useState } from "react";
import { useLocation } from "wouter";
import WorkspaceSwitcher from "./WorkspaceSwitcher";
import { APP_NAV_CLASSES } from "@/lib/navigationLayout";

const navItems = [
  { icon: LayoutDashboard, label: "Projects", path: "/dashboard" },
  { icon: Plus, label: "Create Link", path: "/create" },
  { icon: QrCode, label: "QR Codes", path: "/qr" },
  { icon: Package, label: "Product QR", path: "/product-qr" },
  { icon: LayoutTemplate, label: "Pages", path: "/pages" },
  { icon: Tag, label: "Tags", path: "/tags" },
  { icon: Globe, label: "Domains", path: "/domains" },
  { icon: Users, label: "Team", path: "/team" },
  { icon: FileText, label: "Reports", path: "/export-report" },
  { icon: Shield, label: "Appeals", path: "/appeals" },
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
    <div className="slugly-app min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b border-border bg-background/90 backdrop-blur-[10px]">
        <div className="container flex h-[60px] items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className={APP_NAV_CLASSES.menuButton}>
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72 p-0">
                <div className="flex flex-col h-full">
                  <div className="flex items-center gap-3 p-4 border-b">
                    <img src="/assets/slugly-logo.svg" alt="Slugly" className="w-7 h-7" />
                    <span className="font-[800] text-[16px] tracking-[-0.5px]" style={{ fontFamily: "'Bricolage Grotesque'" }}>Slugly</span>
                  </div>
                  <div className="p-3 border-b"><WorkspaceSwitcher /></div>
                  <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
                    {navItems.map(item => {
                      const isActive = location === item.path ||
                        (item.path === "/dashboard" && location.startsWith("/project")) ||
                        (item.path === "/tags" && location.startsWith("/tags")) ||
                        (item.path === "/team" && location.startsWith("/team")) ||
                        (item.path === "/pages" && location.startsWith("/pages"));
                      return (
                        <button key={item.path} onClick={() => navigateTo(item.path)} className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${isActive ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground hover:bg-accent/50"}`}>
                          <item.icon className="h-4 w-4" />{item.label}
                        </button>
                      );
                    })}
                  </nav>
                  <div className="border-t p-3 space-y-1">
                    <button onClick={() => navigateTo("/security")} className="flex items-center gap-3 w-full px-3 py-2 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-accent/50"><ShieldCheck className="h-4 w-4" />Security & 2FA</button>
                    <button onClick={() => navigateTo("/privacy-settings")} className="flex items-center gap-3 w-full px-3 py-2 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-accent/50"><Lock className="h-4 w-4" />Privacy & Data</button>
                    {(user?.role === "admin" || user?.role === "support") && (
                      <button onClick={() => navigateTo("/admin")} className="flex items-center gap-3 w-full px-3 py-2 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-accent/50"><Shield className="h-4 w-4" />{user.role === "support" ? "Support Console" : "Admin Panel"}</button>
                    )}
                    <button onClick={() => { logout(); setMobileMenuOpen(false); }} className="flex items-center gap-3 w-full px-3 py-2 rounded-md text-sm text-destructive hover:bg-destructive/10"><LogOut className="h-4 w-4" />Sign out</button>
                  </div>
                </div>
              </SheetContent>
            </Sheet>

            <div className="flex shrink-0 cursor-pointer items-center gap-2.5 pr-1.5" onClick={() => setLocation("/dashboard")}>
              <img src="/assets/slugly-logo.svg" alt="Slugly" className="h-7 w-7" />
              <span className="hidden text-xl font-extrabold tracking-[-0.5px] sm:inline" style={{ fontFamily: "'Bricolage Grotesque'" }}>Slugly</span>
            </div>
            <div className={APP_NAV_CLASSES.workspaceSwitcher}><WorkspaceSwitcher /></div>
            <nav className={APP_NAV_CLASSES.desktopNav}>
              {navItems.map(item => {
                const isActive = location === item.path ||
                  (item.path === "/dashboard" && location.startsWith("/project")) ||
                  (item.path === "/tags" && location.startsWith("/tags")) ||
                  (item.path === "/team" && location.startsWith("/team")) ||
                  (item.path === "/pages" && location.startsWith("/pages"));
                return <button key={item.path} onClick={() => setLocation(item.path)} className={`whitespace-nowrap rounded-[9px] px-[11px] py-2 text-sm font-semibold transition-colors ${isActive ? "bg-[#EDEBFB] text-[#4A2FE0]" : "text-muted-foreground hover:bg-accent hover:text-foreground"}`}>{item.label}</button>;
              })}
            </nav>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <NotificationBell />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <Avatar className="h-[34px] w-[34px] border-0"><AvatarFallback className="bg-[#ECE9FF] text-sm font-bold text-[#4A2FE0]">{user?.name?.charAt(0).toUpperCase() || "U"}</AvatarFallback></Avatar>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <div className="px-2 py-1.5"><p className="text-sm font-medium">{user?.name}</p><p className="text-xs text-muted-foreground">{user?.email}</p></div>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setLocation("/security")}><ShieldCheck className="mr-2 h-4 w-4" />Security & 2FA</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setLocation("/privacy-settings")}><Lock className="mr-2 h-4 w-4" />Privacy & Data</DropdownMenuItem>
                {(user?.role === "admin" || user?.role === "support") && <DropdownMenuItem onClick={() => setLocation("/admin")}><Shield className="mr-2 h-4 w-4" />{user.role === "support" ? "Support Console" : "Admin Panel"}</DropdownMenuItem>}
                <DropdownMenuItem onClick={toggleTheme}>{theme === "dark" ? <Sun className="mr-2 h-4 w-4" /> : <Moon className="mr-2 h-4 w-4" />}{theme === "dark" ? "Light mode" : "Dark mode"}</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={logout} className="text-destructive focus:text-destructive"><LogOut className="mr-2 h-4 w-4" />Sign out</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>
      <main className="container py-[26px] pb-14">{children}</main>
    </div>
  );
}
