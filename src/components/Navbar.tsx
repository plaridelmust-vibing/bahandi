/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as React from "react"
import { Button } from "@/components/ui/button"
import { auth, signInWithGoogle } from "@/lib/firebase"
import { useAuthState } from "react-firebase-hooks/auth"
import { LogOut, User, LayoutDashboard, FileText, Menu } from "lucide-react"
import { ChatPane } from "./ChatPane"
import { Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"

interface NavbarProps {
  activeTab: 'dashboard' | 'reports';
  setActiveTab: (tab: 'dashboard' | 'reports') => void;
  onDataChange?: () => void;
}

export function Navbar({ activeTab, setActiveTab, onDataChange }: NavbarProps) {
  const [user] = useAuthState(auth);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false);

  const handleTabClick = (tab: 'dashboard' | 'reports') => {
    setActiveTab(tab);
    setIsMobileMenuOpen(false);
  };

  return (
    <header id="navbar" className="h-16 border-b bg-white flex items-center justify-between px-4 sm:px-8 sticky top-0 z-50">
      <div className="flex items-center gap-12">
        <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
          Bahandi
        </h1>
        
        {user && (
          <nav className="hidden sm:flex items-center gap-2">
            <Button 
              variant={activeTab === 'dashboard' ? 'secondary' : 'ghost'} 
              size="sm"
              onClick={() => setActiveTab('dashboard')}
              className="gap-2 font-semibold text-slate-500 rounded-lg h-9 px-4"
            >
              <LayoutDashboard className="size-4" />
              Dashboard
            </Button>
            <Button 
              variant={activeTab === 'reports' ? 'secondary' : 'ghost'} 
              size="sm"
              onClick={() => setActiveTab('reports')}
              className="gap-2 font-semibold text-slate-500 rounded-lg h-9 px-4"
            >
              <FileText className="size-4" />
              Reports
            </Button>
          </nav>
        )}
      </div>

      <div className="flex items-center gap-2 sm:gap-4">
        {user ? (
          <div className="flex items-center gap-2 sm:gap-3">
            <ChatPane onDataChange={onDataChange} />
            
            {/* Desktop User Info & Logout */}
            <div className="hidden sm:flex items-center gap-3">
              <div className="h-6 w-px bg-slate-200 mx-1" />
              <div className="text-right">
                <p className="text-xs font-medium text-slate-900">{user.displayName}</p>
                <p className="text-[10px] text-slate-400 font-mono">Member since {new Date(user.metadata.creationTime || Date.now()).toLocaleDateString()}</p>
              </div>
              {user.photoURL ? (
                <img 
                  src={user.photoURL} 
                  alt={user.displayName || "User"} 
                  className="size-8 rounded-full ring-2 ring-indigo-50"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="size-8 rounded-full bg-indigo-100 flex items-center justify-center">
                  <User className="size-4 text-indigo-600" />
                </div>
              )}
              <Button variant="ghost" size="icon" onClick={() => auth.signOut()}>
                <LogOut className="size-4 text-slate-500" />
              </Button>
            </div>

            {/* Mobile Burger Menu */}
            <div className="sm:hidden">
              <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
                <SheetTrigger render={<Button variant="ghost" size="icon" />} >
                  <Menu className="size-6 text-slate-700" />
                  <span className="sr-only">Toggle Menu</span>
                </SheetTrigger>
                <SheetContent side="right" className="w-[300px] p-6 max-w-full">
                  <SheetHeader className="p-0 mb-6 text-left">
                    <SheetTitle>Menu</SheetTitle>
                  </SheetHeader>
                  <div className="flex flex-col gap-8">
                    <nav className="flex flex-col gap-2">
                      <Button 
                        variant={activeTab === 'dashboard' ? 'secondary' : 'ghost'} 
                        className="justify-start gap-3 h-12 text-base font-semibold"
                        onClick={() => handleTabClick('dashboard')}
                      >
                        <LayoutDashboard className="size-5" />
                        Dashboard
                      </Button>
                      <Button 
                        variant={activeTab === 'reports' ? 'secondary' : 'ghost'} 
                        className="justify-start gap-3 h-12 text-base font-semibold"
                        onClick={() => handleTabClick('reports')}
                      >
                        <FileText className="size-5" />
                        Reports
                      </Button>
                    </nav>

                    <div className="pt-6 border-t flex flex-col gap-4">
                      <div className="flex items-center gap-3">
                        {user.photoURL ? (
                          <img 
                            src={user.photoURL} 
                            alt={user.displayName || "User"} 
                            className="size-10 rounded-full ring-2 ring-indigo-50"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <div className="size-10 rounded-full bg-indigo-100 flex items-center justify-center">
                            <User className="size-5 text-indigo-600" />
                          </div>
                        )}
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{user.displayName}</p>
                          <p className="text-xs text-slate-500">Member since {new Date(user.metadata.creationTime || Date.now()).toLocaleDateString()}</p>
                        </div>
                      </div>
                      <Button 
                        variant="outline" 
                        className="w-full justify-start gap-3 text-slate-600" 
                        onClick={() => {
                          setIsMobileMenuOpen(false);
                          auth.signOut();
                        }}
                      >
                        <LogOut className="size-4" />
                        Sign Out
                      </Button>
                    </div>
                  </div>
                </SheetContent>
              </Sheet>
            </div>
          </div>
        ) : (
          <Button onClick={signInWithGoogle} className="bg-indigo-600 hover:bg-indigo-700">
            Sign In
          </Button>
        )}
      </div>
    </header>
  )
}
