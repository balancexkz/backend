import React, { useState } from 'react';
import { UserRole } from '../types/interfaces';

interface RegisterFormProps {
  loading: boolean;
  message: string;
  onRegister: (username: string, password: string, role: UserRole) => void;
  onBackToLogin: () => void;
}

export const RegisterForm: React.FC<RegisterFormProps> = ({
  loading,
  message,
  onRegister,
  onBackToLogin,
}) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [selectedRole, setSelectedRole] = useState<UserRole>('vault');
  const [validationError, setValidationError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError('');

    if (username.length < 3) {
      setValidationError('Username must be at least 3 characters');
      return;
    }
    if (password.length < 6) {
      setValidationError('Password must be at least 6 characters');
      return;
    }
    if (password !== confirmPassword) {
      setValidationError('Passwords do not match');
      return;
    }

    onRegister(username, password, selectedRole);
  };

  const displayMessage = validationError || message;

  return (
    <div className="min-h-screen flex items-center justify-center bg-dark-bg px-4">
      <div className="bg-dark-card p-8 rounded-2xl shadow-2xl shadow-accent-500/5 w-full max-w-md border border-dark-border">
        <h1 className="text-2xl font-bold mb-2 text-center text-white">BalanceX</h1>
        <p className="text-sm text-gray-500 text-center mb-6">Create your account</p>

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-gray-400 text-sm font-medium mb-2" htmlFor="reg-username">
              Username
            </label>
            <input
              id="reg-username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="bg-dark-input border border-dark-border text-gray-200 p-3 rounded-lg w-full focus:outline-none focus:border-accent-500 focus:ring-1 focus:ring-accent-500 transition-colors placeholder-gray-600"
              placeholder="Enter username"
              required
            />
          </div>

          <div className="mb-4">
            <label className="block text-gray-400 text-sm font-medium mb-2" htmlFor="reg-password">
              Password
            </label>
            <input
              id="reg-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="bg-dark-input border border-dark-border text-gray-200 p-3 rounded-lg w-full focus:outline-none focus:border-accent-500 focus:ring-1 focus:ring-accent-500 transition-colors placeholder-gray-600"
              placeholder="Enter password"
              required
            />
          </div>

          <div className="mb-6">
            <label className="block text-gray-400 text-sm font-medium mb-2" htmlFor="reg-confirm">
              Confirm Password
            </label>
            <input
              id="reg-confirm"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="bg-dark-input border border-dark-border text-gray-200 p-3 rounded-lg w-full focus:outline-none focus:border-accent-500 focus:ring-1 focus:ring-accent-500 transition-colors placeholder-gray-600"
              placeholder="Confirm password"
              required
            />
          </div>

          {/* Role selector */}
          <div className="mb-6">
            <label className="block text-gray-400 text-sm font-medium mb-3">
              Choose your plan
            </label>
            <div className="space-y-3">
              {/* Vault role */}
              <button
                type="button"
                onClick={() => setSelectedRole('vault')}
                className={`w-full text-left p-4 rounded-xl border-2 transition-all ${
                  selectedRole === 'vault'
                    ? 'border-accent-500 bg-accent-500/5'
                    : 'border-dark-border bg-dark-input hover:border-gray-600'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-white font-semibold text-sm">Automatic Pool</span>
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-accent-500/20 text-accent-400">
                        Recommended
                      </span>
                    </div>
                    <p className="text-gray-500 text-xs leading-relaxed">
                      Invest SOL — our algorithm automatically manages the position and rebalances when needed
                    </p>
                  </div>
                  <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 mt-0.5 ml-3 flex items-center justify-center ${
                    selectedRole === 'vault'
                      ? 'border-accent-500 bg-accent-500'
                      : 'border-gray-600'
                  }`}>
                    {selectedRole === 'vault' && (
                      <div className="w-1.5 h-1.5 rounded-full bg-white" />
                    )}
                  </div>
                </div>
              </button>

              {/* Pro role */}
              <button
                type="button"
                onClick={() => setSelectedRole('pro')}
                className={`w-full text-left p-4 rounded-xl border-2 transition-all ${
                  selectedRole === 'pro'
                    ? 'border-accent-500 bg-accent-500/5'
                    : 'border-dark-border bg-dark-input hover:border-gray-600'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-white font-semibold text-sm">Manual Control</span>
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-400">
                        PRO
                      </span>
                    </div>
                    <p className="text-gray-500 text-xs leading-relaxed">
                      Create your own position, choose a price range, and manage liquidity with our tools
                    </p>
                  </div>
                  <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 mt-0.5 ml-3 flex items-center justify-center ${
                    selectedRole === 'pro'
                      ? 'border-accent-500 bg-accent-500'
                      : 'border-gray-600'
                  }`}>
                    {selectedRole === 'pro' && (
                      <div className="w-1.5 h-1.5 rounded-full bg-white" />
                    )}
                  </div>
                </div>
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="bg-accent-500 text-white p-3 rounded-lg w-full font-semibold hover:bg-accent-400 disabled:bg-gray-700 disabled:text-gray-500 transition-colors"
          >
            {loading ? 'Creating account...' : 'Create Account'}
          </button>
        </form>

        <div className="mt-4 text-center">
          <button
            type="button"
            onClick={onBackToLogin}
            className="text-sm text-gray-500 hover:text-accent-400 transition-colors"
          >
            Already have an account? <span className="text-accent-400">Sign in</span>
          </button>
        </div>

        {displayMessage && (
          <div className={`mt-4 p-3 rounded-lg text-sm ${
            displayMessage.includes('failed') || displayMessage.includes('Error') || displayMessage.includes('must') || displayMessage.includes('match') || displayMessage.includes('already')
              ? 'bg-red-500/10 text-red-400 border border-red-500/20'
              : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
          }`}>
            {displayMessage}
          </div>
        )}
      </div>
    </div>
  );
};
