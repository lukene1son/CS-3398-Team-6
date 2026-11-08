export default function Navbar({ onLoginClick, isLoggedIn }) {
  return (
    <nav className="navbar">
      <div className="nav-brand">
        <img
          src="/buddytech.webp"
          alt="BuddyTech Logo"
          className="nav-logo"
          onError={(e) => { e.target.style.display = 'none'; }}
        />
        <h2 style={{ color: '#0f52ba', fontWeight: 800 }}>BuddyTech</h2>
      </div>

      <ul className="nav-links">
        <li className="nav-anchor"><a href="#features">Features</a></li>
        <li className="nav-anchor"><a href="#about">About</a></li>
        <li className="nav-anchor"><a href="#community">Community</a></li>
        {isLoggedIn ? (
          <li><button className="btn-primary" onClick={onLoginClick}>Go to Dashboard</button></li>
        ) : (
          <>
            <li><button className="btn-outline" onClick={onLoginClick}>Log In</button></li>
            <li><button className="btn-primary" onClick={onLoginClick}>Get Started</button></li>
          </>
        )}
      </ul>
    </nav>
  );
}