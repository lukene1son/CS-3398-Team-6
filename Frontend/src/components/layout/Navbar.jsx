import AnimatedLogo from '../../animation/AnimatedLogo';

// The landing page's navbar: the logo on the left, the section links in the middle of the
// page, the account buttons on the right. When the page loads, the links and buttons pop in
// one after another, each growing from tiny and see-through to full size in its own place
// (App.css .nav-pop; --i is its place in the order).
// onLoginClick: Log In (and Go to Dashboard). onGetStartedClick: Get Started, which opens
// the Create Account screen.
export default function Navbar({ onLoginClick, onGetStartedClick, isLoggedIn }) {
  return (
    <nav className="navbar">
      {/* The logo builds itself letter by letter when the page loads, in BuddyTech blue (AnimatedLogo.jsx). */}
      <div className="nav-brand">
        <div className="nav-logo">
          <AnimatedLogo />
        </div>
      </div>

      <ul className="nav-links nav-center">
        <li className="nav-anchor nav-pop" style={{ '--i': 0 }}><a href="#features">Features</a></li>
        <li className="nav-anchor nav-pop" style={{ '--i': 1 }}><a href="#about">About</a></li>
        <li className="nav-anchor nav-pop" style={{ '--i': 2 }}><a href="#community">Community</a></li>
      </ul>

      <ul className="nav-links nav-actions">
        {isLoggedIn ? (
          <li className="nav-pop" style={{ '--i': 3 }}><button className="btn-primary" onClick={onLoginClick}>Go to Dashboard</button></li>
        ) : (
          <>
            <li className="nav-pop" style={{ '--i': 3 }}><button className="btn-outline" onClick={onLoginClick}>Log In</button></li>
            <li className="nav-pop" style={{ '--i': 4 }}><button className="btn-primary" onClick={onGetStartedClick}>Get Started</button></li>
          </>
        )}
      </ul>
    </nav>
  );
}
