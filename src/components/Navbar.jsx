export default function Navbar() {
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
        <li><a href="#features">Features</a></li>
        <li><a href="#about">About</a></li>
        <li><a href="#community">Community</a></li>
        <li><button className="btn-outline">Log In</button></li>
        <li><button className="btn-primary">Get Started</button></li>
      </ul>
    </nav>
  );
}