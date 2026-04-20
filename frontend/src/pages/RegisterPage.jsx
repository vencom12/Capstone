import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const result = await register(username, email, password);
    if (result.success) {
      navigate('/dashboard');
    } else {
      setError(result.message || 'Registration failed. User may already exist.');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-10">
      <div className="w-full max-w-[500px] p-14 text-center animate-fade"
        style={{
          background: '#191f33',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '40px',
          boxShadow: '0 40px 100px -20px rgba(0,0,0,0.7)',
        }}>
        <h1 className="text-4xl font-extrabold mb-3" style={{
          background: 'linear-gradient(to right, #818cf8, #c084fc)',
          WebkitBackgroundClip: 'text',
          backgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          letterSpacing: '-1px',
        }}>Stitch-Opt</h1>
        <p className="text-text-dim mb-10">Join the Intelligent Embroidery Network</p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-6 text-left">
          <div>
            <label className="block mb-2.5 text-text-dim text-sm font-medium">Username</label>
            <input type="text" value={username} onChange={(e) => setUsername(e.target.value)}
              placeholder="Choose a username" required className="input-field !rounded-2xl !py-4 !px-6" />
          </div>
          <div>
            <label className="block mb-2.5 text-text-dim text-sm font-medium">Email Address</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="name@company.com" required className="input-field !rounded-2xl !py-4 !px-6" />
          </div>
          <div>
            <label className="block mb-2.5 text-text-dim text-sm font-medium">Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••" required className="input-field !rounded-2xl !py-4 !px-6" />
          </div>

          {error && <p className="text-sm text-center" style={{ color: '#ef4444' }}>{error}</p>}

          <button type="submit" className="btn-primary w-full !py-4 !rounded-2xl !text-lg mt-2"
            style={{ boxShadow: '0 10px 25px rgba(99, 102, 241, 0.3)' }}>
            Secure Registration
          </button>
        </form>

        <p className="mt-6 text-sm text-text-dim">
          Already have an account? <Link to="/" className="font-semibold no-underline" style={{ color: 'var(--color-primary)' }}>Sign In</Link>
        </p>
      </div>
    </div>
  );
}
