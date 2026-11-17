import React from 'react';
import { UserRole } from '../types';
import { LogOut, ShieldCheck, ExternalLink } from 'lucide-react';

interface NavbarProps {
  currentTab: string;
  setCurrentTab: (tab: string) => void;
  activeRole: UserRole;
  userName: string;
  onSignOut: () => void;
  portalMode: 'user' | 'admin';
}

export const Navbar: React.FC<NavbarProps> = ({
  currentTab,
  setCurrentTab,
  activeRole,
  userName,
  onSignOut,
  portalMode,
}) => {
  const navItems = [
    { id: 'dashboard', label: portalMode === 'admin' ? 'Admin overview' : 'Dashboard' },
    { id: 'register', label: 'Register' },
    { id: 'parcel_map', label: 'Parcel map' },
    { id: 'title_nft', label: 'Title NFT' },
  ];

  const isTabActive = (id: string) => {
    if (currentTab === id) return true;
    if (id === 'dashboard' && currentTab === 'dashboard') return true;
    if (id === 'parcel_map' && currentTab === 'comp1_gis') return true;
    if (
      id === 'title_nft' &&
      (currentTab === 'public_verify' || currentTab === 'comp3_oracle' || currentTab === 'comp4_eval')
    ) {
      return true;
    }
    return false;
  };

  return (
    <header className="bg-white/95 backdrop-blur-sm border-b border-[#E2E8F0] sticky top-0 z-40">
      <div className="max-w-[1080px] mx-auto px-6 sm:px-8">
        <div className="flex items-center justify-between h-[68px] gap-6">
          {/* Zone 1: Single-line Brand Wordmark */}
          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => setCurrentTab('dashboard')}
              className="font-serif text-[19px] font-medium tracking-tight text-[#0F172A] hover:text-[#2563EB] transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]/40 rounded"
            >
              Anagu Land Registry
            </button>
            {portalMode === 'admin' && (
              <span className="hidden md:inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#EFF6FF] border border-[#BFDBFE] text-[#1D4ED8] text-[10.5px] font-mono font-semibold uppercase tracking-wider">
                <ShieldCheck className="w-3 h-3" />
                <span>Admin</span>
              </span>
            )}
          </div>

          {/* Zone 2: Clean Typography Nav Links */}
          <nav className="flex items-center gap-5 sm:gap-7 overflow-x-auto scrollbar-none" aria-label="Primary">
            {navItems.map((item) => {
              const active = isTabActive(item.id);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setCurrentTab(item.id)}
                  className={`relative py-2 text-[13.5px] whitespace-nowrap shrink-0 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]/40 rounded ${
                    active
                      ? 'text-[#2563EB] font-semibold'
                      : 'text-[#475569] hover:text-[#0F172A] font-medium'
                  }`}
                >
                  {item.label}
                  {active && (
                    <span
                      className="absolute inset-x-0 -bottom-[1px] h-[2px] bg-[#2563EB] rounded-full"
                      aria-hidden="true"
                    />
                  )}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: Primary Action & Authenticated User */}
          <div className="hidden sm:flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => setCurrentTab('public_verify')}
              className="px-3.5 py-2 bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-[13px] font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]/50"
            >
              Verify Title
            </button>

            {portalMode === 'admin' && (
              <a
                href="/"
                className="px-2.5 py-1.5 bg-[#F8FAFC] hover:bg-[#F1F5F9] border border-[#E2E8F0] text-[#334155] text-[12px] font-medium rounded-lg inline-flex items-center gap-1 whitespace-nowrap shrink-0 transition-colors"
                title="Open User Portal (/)"
              >
                <span>User Portal</span>
                <ExternalLink className="w-3 h-3 text-[#64748B]" />
              </a>
            )}

            <div className="flex items-center gap-2 pl-2 border-l border-[#E2E8F0]">
              <div className="text-right leading-tight max-w-[130px]">
                <div className="text-[12px] font-medium text-[#0F172A] truncate">{userName}</div>
                <div className="text-[10.5px] font-mono text-[#64748B]">{activeRole}</div>
              </div>
              <button
                type="button"
                onClick={onSignOut}
                title="Sign out"
                className="p-2 text-[#64748B] hover:text-[#DC2626] hover:bg-[#FEF2F2] rounded-lg transition-colors cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};
