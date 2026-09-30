import { Users, GraduationCap, Laptop, Sparkles } from 'lucide-react';

export default function Home() {
  return (
    <main>
      <section className="hero">
        <span className="badge">
          <Sparkles size={14} />
          Empowering Student Collaboration
        </span>
        <h1>
          Learn, Build, and Connect with <span>BuddyTech</span>
        </h1>
        <p>
          Find peer mentors, collaborate on technical coursework, and master your software skills together.
        </p>
        <div className="hero-actions">
          <button className="btn-primary">Find a Tech Buddy</button>
          <button className="btn-outline">Explore Projects</button>
        </div>
      </section>

      <section className="features" id="features">
        <div className="features-header">
          <h2>Why Choose BuddyTech?</h2>
          <p style={{ color: '#64748b' }}>Everything you need to level up your technical learning experience.</p>
        </div>

        <div className="features-grid">
          <div className="feature-card">
            <div className="feature-icon">
              <Users size={24} />
            </div>
            <h3>Peer Matching</h3>
            <p style={{ color: '#64748b', marginTop: '0.5rem' }}>
              Connect with classmates and peers working on similar assignments and programming challenges.
            </p>
          </div>

          <div className="feature-card">
            <div className="feature-icon">
              <GraduationCap size={24} />
            </div>
            <h3>Tutoring & Mentorship</h3>
            <p style={{ color: '#64748b', marginTop: '0.5rem' }}>
              Learn from upperclassmen and mentors who have already conquered the classes you're taking.
            </p>
          </div>

          <div className="feature-card">
            <div className="feature-icon">
              <Laptop size={24} />
            </div>
            <h3>Study Groups</h3>
            <p style={{ color: '#64748b', marginTop: '0.5rem' }}>
              Form focused study cohorts for computer science, software engineering, and lab assignments.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}