import React, { useState, useEffect } from 'react';
import api from '../services/api';
import toast from 'react-hot-toast';
import { 
  UserPlus, 
  Mail, 
  Lock, 
  User, 
  Briefcase, 
  PhoneCall, 
  ShieldCheck, 
  Loader2,
  CheckCircle2
} from 'lucide-react';

const RegisterEmployee = () => {
  const [departments, setDepartments] = useState([]);
  const [loadingDepts, setLoadingDepts] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Form states
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('employee');
  const [departmentId, setDepartmentId] = useState('');
  const [whatsappNumber, setWhatsappNumber] = useState('');

  useEffect(() => {
    const fetchDepts = async () => {
      try {
        const data = await api.get('/departments');
        setDepartments(data);
        if (data.length > 0) setDepartmentId(data[0].id.toString());
      } catch (err) {
        console.error(err);
        toast.error('Failed to load company departments list.');
      } finally {
        setLoadingDepts(false);
      }
    };
    fetchDepts();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!firstName || !lastName || !email || !password) {
      toast.error('Please fill in all required fields.');
      return;
    }

    setSubmitting(true);
    const toastId = toast.loading('Registering employee account...');

    try {
      await api.post('/auth/register', {
        first_name: firstName,
        last_name: lastName,
        email,
        password,
        role,
        department_id: departmentId ? parseInt(departmentId) : null,
        whatsapp_number: whatsappNumber || null
      });

      toast.success('Employee account registered successfully!', { id: toastId });
      
      // Clear form inputs
      setFirstName('');
      setLastName('');
      setEmail('');
      setPassword('');
      setWhatsappNumber('');
    } catch (err) {
      console.error(err);
      toast.error(err.message || 'Failed to register employee.', { id: toastId });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex-1 p-8 overflow-y-auto h-screen animate-fade-in">
      {/* Header Banner */}
      <div className="mb-10">
        <h2 className="text-3xl font-bold tracking-tight text-white font-sans">
          Register New <span className="gradient-text font-bold">Employee Account</span>
        </h2>
        <p className="text-zinc-400 text-sm mt-1">
          Create credentials, assign roles, define departments, and attach mobile numbers for automated reporting.
        </p>
      </div>

      {loadingDepts ? (
        <div className="glass-card p-16 flex flex-col items-center justify-center text-zinc-500 gap-3 max-w-xl mx-auto">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <span>Synchronizing company department matrix...</span>
        </div>
      ) : (
        <div className="glass-card p-8 max-w-xl mx-auto border-zinc-800/80 animate-slide-up">
          <h3 className="text-base font-bold text-white mb-6 flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-primary" />
            Employee Information Profile
          </h3>

          <form onSubmit={handleSubmit} className="space-y-4">
            
            {/* First and Last Name row */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
                  First Name
                </label>
                <div className="relative">
                  <User className="absolute left-3.5 top-3 w-4.5 h-4.5 text-zinc-500" />
                  <input
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="John"
                    className="input-field pl-10 text-sm py-2.5"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
                  Last Name
                </label>
                <div className="relative">
                  <User className="absolute left-3.5 top-3 w-4.5 h-4.5 text-zinc-500" />
                  <input
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Doe"
                    className="input-field pl-10 text-sm py-2.5"
                    required
                  />
                </div>
              </div>
            </div>

            {/* Email Address */}
            <div>
              <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
                Work Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-3 w-4.5 h-4.5 text-zinc-500" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="john.doe@company.com"
                  className="input-field pl-10 text-sm py-2.5"
                  required
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
                Initial Account Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-3 w-4.5 h-4.5 text-zinc-500" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="input-field pl-10 text-sm py-2.5"
                  required
                />
              </div>
            </div>

            {/* Department Selector */}
            <div>
              <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
                Company Department Assignment
              </label>
              <div className="relative">
                <Briefcase className="absolute left-3.5 top-3 w-4.5 h-4.5 text-zinc-500" />
                <select
                  value={departmentId}
                  onChange={(e) => setDepartmentId(e.target.value)}
                  className="bg-zinc-900 border border-zinc-800/80 rounded-xl pl-10 pr-3 py-2.5 text-zinc-300 text-sm focus:outline-none focus:border-primary w-full h-[46px]"
                >
                  {departments.map(d => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Role & WhatsApp Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
                  System Authorization Role
                </label>
                <div className="relative">
                  <ShieldCheck className="absolute left-3.5 top-3 w-4.5 h-4.5 text-zinc-500" />
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    className="bg-zinc-900 border border-zinc-800/80 rounded-xl pl-10 pr-3 py-2.5 text-zinc-300 text-sm focus:outline-none focus:border-primary w-full h-[46px]"
                  >
                    <option value="employee">Employee</option>
                    <option value="admin">System Administrator</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
                  WhatsApp Contact Number
                </label>
                <div className="relative">
                  <PhoneCall className="absolute left-3.5 top-3 w-4.5 h-4.5 text-zinc-500" />
                  <input
                    type="text"
                    value={whatsappNumber}
                    onChange={(e) => setWhatsappNumber(e.target.value)}
                    placeholder="e.g. +14155552671"
                    className="input-field pl-10 text-sm py-2.5"
                  />
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="btn-primary w-full py-3.5 text-sm font-semibold flex items-center justify-center gap-2 shadow-primary/10 hover:shadow-primary/20 mt-4"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Creating account...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  Provision Employee Account
                </>
              )}
            </button>
          </form>
        </div>
      )}
    </div>
  );
};

export default RegisterEmployee;
