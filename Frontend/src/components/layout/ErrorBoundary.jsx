import { Component } from 'react';

// Catches render errors anywhere below it so a bug shows a message
// instead of a blank white page. The real error is still in the console.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('BuddyTech crashed while rendering:', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div style={{ padding: '3rem', fontFamily: 'inherit', textAlign: 'center' }}>
        <h2>Something went wrong.</h2>
        <p style={{ color: '#64748b' }}>{String(this.state.error.message || this.state.error)}</p>
        <button
          type="button"
          onClick={() => { window.location.href = '/'; }}
          style={{ marginTop: '1rem', padding: '0.6rem 1.2rem', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer' }}
        >
          Back to home
        </button>
      </div>
    );
  }
}
