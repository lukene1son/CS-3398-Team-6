import { Users, GraduationCap, Laptop, Sparkles, MessageSquare, Calendar } from 'lucide-react';
import './Landing.css';

export default function Home({ onGetStarted, isLoggedIn }) {
  const scrollToFeatures = () => {
    document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' });
  };

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
          <button className="btn-primary" onClick={onGetStarted}>
            {isLoggedIn ? 'Go to Dashboard' : 'Find a Tech Buddy'}
          </button>
          <button className="btn-outline" onClick={scrollToFeatures}>Explore Features</button>
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

      <section className="how-section" id="about">
        <div className="features-header">
          <h2>How BuddyTech Works</h2>
          <p style={{ color: '#64748b' }}>Three steps from "I'm stuck" to "I've got this."</p>
        </div>

        <div className="steps-grid">
          <div className="step-card">
            <div className="step-icon"><Users size={22} /></div>
            <span className="step-number">Step 1</span>
            <h3>Join your course spaces</h3>
            <p>Every course has its own space with channels for homework help, exam prep, and general chat.</p>
          </div>

          <div className="step-card">
            <div className="step-icon"><MessageSquare size={22} /></div>
            <span className="step-number">Step 2</span>
            <h3>Chat and stay organized</h3>
            <p>Talk with classmates in real time and track assignments in your planner.</p>
          </div>

          <div className="step-card">
            <div className="step-icon"><Calendar size={22} /></div>
            <span className="step-number">Step 3</span>
            <h3>Study smarter with AI</h3>
            <p>Summarize notes, generate practice questions, and get concepts explained on demand.</p>
          </div>
        </div>
      </section>

      <section className="cta-banner" id="community">
        <h2>Ready to find your study buddy?</h2>
        <p>Join your classmates on BuddyTech and make your next assignment a team effort.</p>
        <button className="cta-button" onClick={onGetStarted}>
          {isLoggedIn ? 'Go to Dashboard' : 'Get Started'}
        </button>
      </section>
    </main>
  );
}