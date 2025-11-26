import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, useSearchParams, useNavigate } from 'react-router-dom';
import './App.css';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<RequestForm />} />
        <Route path="/set-password" element={<SetPasswordForm />} />
      </Routes>
    </BrowserRouter>
  );
}

function RequestForm() {
  const [deviceName, setDeviceName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [requestId, setRequestId] = useState(null);
  const [status, setStatus] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    if (requestId) {
      const interval = setInterval(() => {
        fetch(`/api/request/status/${requestId}`)
          .then(res => res.json())
          .then(data => {
            setStatus(data.status);
            if (data.status === 'approved') {
              clearInterval(interval);
              navigate(`/set-password?email=${email}`);
            }
          });
      }, 3000);
      return () => clearInterval(interval);
    }
  }, [requestId, email, navigate]);

  const sendRequest = async () => {
    setLoading(true);
    setMessage('');

    try {
      const res = await fetch('/api/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceName, email }),
      });
      const data = await res.json();
      setMessage(data.message || 'An error occurred.');
      if (res.ok) {
        setRequestId(data.requestId);
      }
    } catch (error) {
      setMessage('An error occurred. Please try again.');
    }

    setLoading(false);
  };

  return (
    <div className="container">
      <div className="card">
        <h2>Request Wi-Fi Access</h2>
        <p>Enter your device name and email to request access.</p>
        
        <input
          type="text"
          value={deviceName}
          onChange={(e) => setDeviceName(e.target.value)}
          placeholder="Enter Device Name"
          disabled={loading || requestId}
        />
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Enter Your Email"
          disabled={loading || requestId}
        />

        <button onClick={sendRequest} disabled={loading || requestId}>
          {loading ? 'Sending...' : (requestId ? 'Waiting for Approval...' : 'Request Wi-Fi')}
        </button>

        {message && <p className="message">{message}</p>}
        {status && <p className="status">Status: {status}</p>}
      </div>
    </div>
  );
}

function SetPasswordForm() {
    const [searchParams] = useSearchParams();
    const email = searchParams.get('email');
    const [otp, setOtp] = useState('');
    const [password, setPassword] = useState('');
    const [message, setMessage] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        setMessage('');
        try {
            const res = await fetch('/api/set-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, otp, password })
            });
            const data = await res.json();
            if (data.success) {
                setMessage('Password set! You can now connect.');
            } else {
                setMessage(data.message || 'Failed to set password.');
            }
        } catch (err) {
            setMessage('An error occurred.');
        }
    };

    return (
        <div className="container">
            <div className="card">
                <h2>Set Your Wi-Fi Password</h2>
                <p>An OTP has been sent to <strong>{email}</strong>. Please enter it below to set your password.</p>
                <form onSubmit={handleSubmit}>
                    <input 
                        type="text" 
                        placeholder="Enter OTP" 
                        value={otp} 
                        onChange={e => setOtp(e.target.value)} 
                        required 
                    />
                    <input 
                        type="password" 
                        placeholder="Enter New Password" 
                        value={password} 
                        onChange={e => setPassword(e.target.value)} 
                        required 
                    />
                    <button type="submit">Set Password</button>
                </form>
                {message && <p className="message">{message}</p>}
            </div>
        </div>
    );
}

export default App;
