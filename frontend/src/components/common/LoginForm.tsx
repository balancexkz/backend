import React from 'react';

interface LoginFormProps {
  username: string;
  password: string;
  loading: boolean;
  message: string;
  onUsernameChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onRegisterClick: () => void;
}

export const LoginForm: React.FC<LoginFormProps> = ({
  username,
  password,
  loading,
  message,
  onUsernameChange,
  onPasswordChange,
  onSubmit,
  onRegisterClick,
}) => {
  return (
    <div className="min-h-screen flex items-center justify-center bg-dark-bg">
      <div className="bg-dark-card p-8 rounded-2xl shadow-2xl shadow-accent-500/5 w-96 border border-dark-border">
        <h1 className="text-2xl font-bold mb-2 text-center text-white">BalanceX</h1>
        <p className="text-sm text-gray-500 text-center mb-6">Sign in to your account</p>
        <form onSubmit={onSubmit}>
          <div className="mb-4">
            <label className="block text-gray-400 text-sm font-medium mb-2" htmlFor="username">
              Username
            </label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => onUsernameChange(e.target.value)}
              className="bg-dark-input border border-dark-border text-gray-200 p-3 rounded-lg w-full focus:outline-none focus:border-accent-500 focus:ring-1 focus:ring-accent-500 transition-colors placeholder-gray-600"
              placeholder="Enter username"
              required
            />
          </div>
          <div className="mb-6">
            <label className="block text-gray-400 text-sm font-medium mb-2" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => onPasswordChange(e.target.value)}
              className="bg-dark-input border border-dark-border text-gray-200 p-3 rounded-lg w-full focus:outline-none focus:border-accent-500 focus:ring-1 focus:ring-accent-500 transition-colors placeholder-gray-600"
              placeholder="Enter password"
              required
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="bg-accent-500 text-white p-3 rounded-lg w-full font-semibold hover:bg-accent-400 disabled:bg-gray-700 disabled:text-gray-500 transition-colors"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
        <div className="mt-4 text-center">
          <button
            type="button"
            onClick={onRegisterClick}
            className="text-sm text-gray-500 hover:text-accent-400 transition-colors"
          >
            Don't have an account? <span className="text-accent-400">Create one</span>
          </button>
        </div>
        {message && (
          <div className={`mt-4 p-3 rounded-lg text-sm ${message.includes('failed') ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'}`}>
            {message}
          </div>
        )}
      </div>
    </div>
  );
};
