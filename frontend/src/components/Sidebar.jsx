import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { 
  LayoutDashboard, 
  QrCode, 
  UserPlus, 
  LogOut, 
  CheckSquare, 
  User,
  Zap
} from 'lucide-react';

const Sidebar = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const employeeLinks = [
    { to: '/dashboard', label: 'My Tasks', icon: CheckSquare }
  ];

  const adminLinks = [
    { to: '/admin', label: 'Overview', icon: LayoutDashboard },
    { to: '/whatsapp-setup', label: 'WhatsApp Setup', icon: QrCode },
    { to: '/register-employee', label: 'Register Employee', icon: UserPlus }
  ];

  const links = user?.role === 'admin' ? adminLinks : employeeLinks;

  return (
    <div className="w-64 h-screen bg-darkbg-900 border-r border-zinc-800/80 flex flex-col justify-between p-4 sticky top-0">
      <div className="flex flex-col gap-8">
        {/* App Title */}
        <div className="flex items-center gap-3 px-2 py-3 border-b border-zinc-800/60">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-primary to-indigo-500 flex items-center justify-center shadow-lg shadow-primary/20">
            <Zap className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-white font-sans font-extrabold">TaskUpdater</h1>
            <span className="text-[10px] text-zinc-500 tracking-wider uppercase font-medium">Enterprise Suite</span>
          </div>
        </div>

        {/* Navigation Menu */}
        <nav className="flex flex-col gap-1.5">
          <span className="text-[10px] px-3 font-semibold text-zinc-500 uppercase tracking-widest mb-2 block">
            Navigation Menu
          </span>
          {links.map((link) => {
            const Icon = link.icon;
            return (
              <NavLink
                key={link.to}
                to={link.to}
                className={({ isActive }) => 
                  `flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 font-medium group ${
                    isActive 
                      ? 'bg-primary/10 text-primary border border-primary/20 shadow-glow' 
                      : 'text-zinc-400 hover:bg-zinc-800/40 hover:text-zinc-200 border border-transparent'
                  }`
                }
              >
                <Icon className="w-5 h-5 group-hover:scale-105 transition-transform duration-300" />
                <span className="text-sm">{link.label}</span>
              </NavLink>
            );
          })}
        </nav>
      </div>

      {/* User Info & Logout */}
      <div className="flex flex-col gap-4 border-t border-zinc-800/60 pt-4">
        <div className="flex items-center gap-3 px-2">
          <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center border border-zinc-700 text-primary font-bold text-lg">
            {user?.first_name?.[0]?.toUpperCase() || <User className="w-5 h-5" />}
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="text-sm font-semibold text-white truncate">
              {user?.first_name} {user?.last_name}
            </h4>
            <span className="text-xs text-zinc-500 capitalize flex items-center gap-1 font-medium">
              <span className={`w-1.5 h-1.5 rounded-full ${user?.role === 'admin' ? 'bg-indigo-400' : 'bg-green-400'}`}></span>
              {user?.role}
            </span>
          </div>
        </div>

        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-4 py-3 text-zinc-400 hover:text-red-400 hover:bg-red-950/20 border border-transparent hover:border-red-900/30 rounded-xl transition-all duration-200 w-full"
        >
          <LogOut className="w-5 h-5" />
          <span className="text-sm font-medium">Sign Out</span>
        </button>
      </div>
    </div>
  );
};

export default Sidebar;
