import React, { useState } from 'react';
import { Lock, User, Building2, Eye, EyeOff, ShieldAlert, Check } from 'lucide-react';

interface LoginPageProps {
  onLoginSuccess: (user: { username: string; role: 'police' | 'bbmp' | 'emergency' | 'admin' }) => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onLoginSuccess }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'police' | 'bbmp' | 'emergency' | 'admin'>('police');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loginStep, setLoginStep] = useState<'idle' | 'authenticating' | 'granted'>('idle');

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError('Please enter both username and password.');
      return;
    }

    setLoginStep('authenticating');
    setError(null);

    // Simulate backend verification and role-based redirect animations
    setTimeout(() => {
      setLoginStep('granted');
      
      setTimeout(() => {
        const sessionData = {
          username: username.trim(),
          role,
          token: btoa(`astram_${role}_${Date.now()}`),
          loginTime: new Date().toISOString()
        };
        // Securely serialize session info in localStorage
        localStorage.setItem('astram_session', btoa(JSON.stringify(sessionData)));
        onLoginSuccess({ username: sessionData.username, role });
        setLoginStep('idle');
      }, 800);
    }, 1200);
  };

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-[960px] bg-white border border-slate-200 rounded-3xl shadow-2xl overflow-hidden grid md:grid-cols-12 min-h-[580px] transition-all">
        
        {/* Left Side: Government Branding Panel (5 cols) */}
        <div className="md:col-span-5 bg-slate-900 p-8 text-white flex flex-col justify-between relative overflow-hidden">
          {/* Subtle grid pattern background */}
          <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#fff_1px,transparent_1px)] [background-size:16px_16px]"></div>
          
          <div className="relative z-10 space-y-6">
            {/* Logo Emblem */}
            <div className="flex items-center space-x-3">
              <img 
                src="/logo.jpg" 
                alt="ASTRAM Logo" 
                className="w-12 h-12 rounded-2xl object-cover bg-white border border-white/20 shadow-md"
              />
              <div>
                <h2 className="text-base font-black tracking-widest text-slate-100 leading-none">ASTRAM</h2>
                <p className="text-[9px] text-blue-300 font-extrabold uppercase tracking-wider mt-1">Govt. of Karnataka</p>
              </div>
            </div>

            <div className="space-y-3.5">
              <span className="px-3 py-1 bg-white/15 rounded-full text-[10px] font-black uppercase tracking-wider text-blue-200 border border-white/10 shadow-xs inline-block">
                Bengaluru Command Node
              </span>
              <h1 className="text-xl font-black tracking-tight leading-tight text-white font-sans">
                ASTRAM – Bengaluru Traffic Management Center
              </h1>
              <p className="text-blue-300 text-[11px] font-bold leading-normal font-sans">
                Unified Smart Mobility & Emergency Response Platform
              </p>
            </div>

            {/* Access List */}
            <div className="space-y-2 bg-white/5 border border-white/10 p-4.5 rounded-2xl backdrop-blur-xs shadow-xs">
              <span className="text-[10px] font-black uppercase text-blue-300 tracking-wider block font-sans">Authorized access for:</span>
              <ul className="text-[11px] space-y-1.5 font-bold text-slate-100 font-sans">
                <li className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-blue-400"></span>
                  Traffic Police Department
                </li>
                <li className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-blue-400"></span>
                  BBMP Operations
                </li>
                <li className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-blue-400"></span>
                  Emergency Response Services
                </li>
                <li className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-blue-400"></span>
                  Traffic Management Command Center
                </li>
              </ul>
            </div>

            {/* Features List */}
            <div className="space-y-2">
              <span className="text-[10px] font-black uppercase text-blue-300 tracking-wider block text-left font-sans">Features:</span>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[10px] font-bold text-slate-100 font-sans">
                <span className="flex items-center gap-1.5">✓ Live Traffic Monitoring</span>
                <span className="flex items-center gap-1.5">✓ Incident Management</span>
                <span className="flex items-center gap-1.5">✓ Emergency Dispatch</span>
                <span className="flex items-center gap-1.5">✓ Event Traffic Planning</span>
                <span className="flex items-center gap-1.5">✓ Resource Allocation</span>
                <span className="flex items-center gap-1.5">✓ City Traffic Intelligence</span>
              </div>
            </div>
          </div>

          {/* Security Banner Foot */}
          <div className="relative z-10 pt-4 border-t border-white/10 space-y-2 bg-black/20 p-4 rounded-2xl border border-white/5 mt-6">
            <div className="flex items-center gap-2 text-rose-400">
              <ShieldAlert className="h-4.5 w-4.5 shrink-0" />
              <strong className="text-[10px] font-black uppercase tracking-widest text-rose-400 font-sans">
                Authorized Personnel Only
              </strong>
            </div>
            <p className="text-[9px] text-slate-200 leading-normal font-semibold font-sans">
              All activities are monitored and logged. Unauthorized access attempts will be prosecuted under cyber security acts.
            </p>
          </div>
        </div>

        {/* Right Side: Form Access Portal (7 cols) */}
        <div className="md:col-span-7 p-8 flex flex-col justify-center bg-slate-50/50">
          <div className="w-full max-w-[420px] mx-auto space-y-6">
            
            <div className="space-y-1">
              <h2 className="text-xl font-black text-slate-900 tracking-tight font-sans">TMC Operator Sign In</h2>
              <p className="text-xs text-slate-500 font-semibold font-sans">Access ASTRAM control nodes and telemetry grids.</p>
            </div>

            {error && (
              <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs px-4 py-3 rounded-xl flex items-start gap-2.5 animate-shake">
                <ShieldAlert className="h-4.5 w-4.5 shrink-0 mt-0.5" />
                <span className="font-bold leading-normal font-sans">{error}</span>
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-4">
              {/* Department Selection */}
              <div className="space-y-1.5">
                <label htmlFor="dept-select" className="block text-[10px] font-black uppercase text-slate-700 tracking-wide font-sans">
                  Department Node Selection
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-550">
                    <Building2 className="h-4.5 w-4.5" />
                  </div>
                  <select
                    id="dept-select"
                    value={role}
                    onChange={(e) => setRole(e.target.value as 'police' | 'bbmp' | 'emergency' | 'admin')}
                    className="w-full pl-10 pr-10 py-3 text-xs font-bold text-slate-800 bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 appearance-none cursor-pointer min-h-[44px] transition-all font-sans"
                  >
                    <option value="police">🛡️ Traffic Police Department</option>
                    <option value="bbmp">🏙️ BBMP Operations</option>
                    <option value="emergency">🚨 Emergency Services (SDRF/Fire/Ambulance)</option>
                    <option value="admin">💻 Traffic Management Command Center</option>
                  </select>
                  <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-slate-500">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>
              </div>

              {/* Username */}
              <div className="space-y-1.5">
                <label htmlFor="username-input" className="block text-[10px] font-black uppercase text-slate-700 tracking-wide font-sans">
                  TMC Username
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-555">
                    <User className="h-4.5 w-4.5" />
                  </div>
                  <input
                    id="username-input"
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Enter system username"
                    className="w-full pl-10 pr-4 py-3 text-xs font-bold text-slate-800 bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 placeholder-slate-400 min-h-[44px] transition-all font-sans"
                    required
                  />
                </div>
              </div>

              {/* Password */}
              <div className="space-y-1.5">
                <label htmlFor="password-input" className="block text-[10px] font-black uppercase text-slate-700 tracking-wide font-sans">
                  Credentials Token (Password)
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-555">
                    <Lock className="h-4.5 w-4.5" />
                  </div>
                  <input
                    id="password-input"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-10 pr-10 py-3 text-xs font-bold text-slate-800 bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 placeholder-slate-400 min-h-[44px] transition-all font-sans"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-655 min-h-[44px]"
                  >
                    {showPassword ? <EyeOff className="h-4.5 w-4.5" /> : <Eye className="h-4.5 w-4.5" />}
                  </button>
                </div>
              </div>

              {/* Sign In Button */}
              <button
                type="submit"
                disabled={loginStep !== 'idle'}
                className={`w-full py-3.5 px-4 rounded-xl font-black text-xs transition-all flex items-center justify-center gap-2 shadow-lg min-h-[44px] cursor-pointer font-sans ${
                  loginStep === 'authenticating'
                    ? 'bg-blue-600/80 text-white shadow-none'
                    : loginStep === 'granted'
                    ? 'bg-emerald-600 text-white shadow-emerald-500/10'
                    : 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-500/10'
                }`}
              >
                {loginStep === 'authenticating' && (
                  <>
                    <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    <span>Authenticating User...</span>
                  </>
                )}
                {loginStep === 'granted' && (
                  <>
                    <Check className="h-4.5 w-4.5 text-white animate-bounce" />
                    <span className="uppercase tracking-wider">Access Granted</span>
                  </>
                )}
                {loginStep === 'idle' && (
                  <span>Sign In to Terminal</span>
                )}
              </button>
            </form>
          </div>
        </div>

      </div>
    </div>
  );
};
