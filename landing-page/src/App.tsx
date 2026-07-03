import { useRef, useEffect, useState } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { FaWindows, FaLinux, FaTimes } from 'react-icons/fa';
import { useTranslation } from 'react-i18next';
import Lenis from 'lenis';
import './App.css';

gsap.registerPlugin(ScrollTrigger);

const IntroLoader = ({ onComplete, t }: { onComplete: () => void, t: any }) => {
  const loaderRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    const tl = gsap.timeline({
      onComplete: () => onComplete()
    });

    tl.to(textRef.current, {
      opacity: 1,
      y: 0,
      duration: 0.8,
      delay: 0.2,
      ease: 'power3.out'
    })
    .to(textRef.current, {
      opacity: 0,
      y: -20,
      duration: 0.5,
      delay: 1.2,
      ease: 'power3.in'
    })
    .to(loaderRef.current, {
      yPercent: -100,
      duration: 0.8,
      ease: 'expo.inOut'
    });
  }, { scope: loaderRef });

  return (
    <div className="intro-loader" ref={loaderRef}>
      <div className="loader-text" ref={textRef}>
        {t('intro.prefix')}<span className="rainbow-text">{t('intro.highlight')}</span>
      </div>
    </div>
  );
};

const LegalModal = ({ isOpen, onClose, type, t }: { isOpen: boolean, onClose: () => void, type: 'privacy' | 'terms', t: any }) => {
  if (!isOpen) return null;

  const content = type === 'privacy' ? (
    <>
      <h2>{t('footer.privacy')}</h2>
      <h3>1. Procesamiento Local-First</h3>
      <p>Gesto procesa todos los datos de video y audio directamente en su dispositivo. Las coordenadas de la mano y los datos de voz nunca se transmiten a servidores externos ni se almacenan permanentemente.</p>
      <h3>2. Datos Biométricos</h3>
      <p>El seguimiento de 21 puntos de la mano se utiliza exclusivamente para el control de la interfaz en tiempo real. Estos datos son efímeros y se descartan inmediatamente después de su procesamiento.</p>
      <h3>3. Almacenamiento Local</h3>
      <p>Cualquier configuración de la aplicación se almacena localmente en su máquina. No tenemos acceso a sus archivos ni a su historial de uso.</p>
    </>
  ) : (
    <>
      <h2>{t('footer.terms')}</h2>
      <h3>1. Licencia de Uso</h3>
      <p>Se otorga permiso para utilizar Gesto de forma personal y gratuita. Queda estrictamente prohibida la redistribución o comercialización sin consentimiento previo.</p>
      <h3>2. Responsabilidad</h3>
      <p>El software se proporciona "tal cual", sin garantías de ningún tipo. El autor no se hace responsable de reclamaciones o daños derivados del uso del software.</p>
      <h3>3. Reconocimientos</h3>
      <p>Parte de la lógica de procesamiento ha sido inspirada en componentes de código abierto bajo licencia MIT.</p>
    </>
  );

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}><FaTimes /></button>
        {content}
      </div>
    </div>
  );
};

function App() {
  const container = useRef<HTMLDivElement>(null);
  const { t, i18n } = useTranslation();
  const [isNavDark, setIsNavDark] = useState(false);
  const [showIntro, setShowIntro] = useState(true);
  const [legalModal, setLegalModal] = useState<{ isOpen: boolean, type: 'privacy' | 'terms' }>({ isOpen: false, type: 'privacy' });

  useEffect(() => {
    const lenis = new Lenis();
    function raf(time: number) {
      lenis.raf(time);
      requestAnimationFrame(raf);
    }
    requestAnimationFrame(raf);

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const isLightBg = entry.target.id === 'tech' || entry.target.id === 'download' || entry.target.id === 'rainbow';
          setIsNavDark(isLightBg);
        }
      });
    }, { threshold: 0.1 });

    document.querySelectorAll('section').forEach(section => observer.observe(section));

    return () => {
      lenis.destroy();
      observer.disconnect();
    };
  }, []);

  useGSAP(() => {
    if (showIntro) return;

    gsap.utils.toArray<HTMLElement>('.panel-bg').forEach((bg) => {
      gsap.to(bg, {
        yPercent: 10,
        ease: 'none',
        scrollTrigger: {
          trigger: bg.parentElement,
          start: 'top bottom',
          end: 'bottom top',
          scrub: true
        }
      });
    });

    const panels = gsap.utils.toArray<HTMLElement>('.panel:not(.download-section)');
    panels.forEach((panel, i) => {
      ScrollTrigger.create({
        trigger: panel,
        start: 'top top',
        pin: true,
        pinSpacing: false,
        anticipatePin: 1
      });

      if (i < panels.length - 1) {
        gsap.to(panel, {
          scale: 0.94,
          scrollTrigger: {
            trigger: panel,
            start: 'top top',
            end: 'bottom top',
            scrub: true
          }
        });
      }
    });

    const magneticElements = gsap.utils.toArray<HTMLElement>('.download-pill');
    magneticElements.forEach((el) => {
      el.addEventListener('mousemove', (e) => {
        const rect = el.getBoundingClientRect();
        const x = (e.clientX - rect.left - rect.width / 2) * 0.15;
        const y = (e.clientY - rect.top - rect.height / 2) * 0.15;
        gsap.to(el, { x, y, duration: 0.3 });
      });
      el.addEventListener('mouseleave', () => {
        gsap.to(el, { x: 0, y: 0, duration: 0.5, ease: 'elastic.out(1, 0.3)' });
      });
    });

    gsap.from('.reveal-item', {
      scrollTrigger: {
        trigger: '.tech-showcase',
        start: 'top 80%',
      },
      y: 40,
      opacity: 0,
      stagger: 0.1,
      duration: 1,
      ease: 'power3.out'
    });

    gsap.from('.reveal-text', {
      scrollTrigger: {
        trigger: '.download-section',
        start: 'top 90%',
      },
      y: 20,
      opacity: 0,
      stagger: 0.2,
      duration: 1,
      ease: 'power3.out'
    });

  }, { scope: container, dependencies: [i18n.language, showIntro] });

  return (
    <div className="app-container" ref={container}>
      {showIntro && <IntroLoader onComplete={() => setShowIntro(false)} t={t} />}
      
      <nav className={`navbar ${isNavDark ? 'nav-dark' : 'nav-light'} ${showIntro ? 'nav-hidden' : ''}`}>
        <div className="logo">GESTO.IO</div>
        <div className="nav-links">
          <a href="#experience">{t('nav.experience')}</a>
          <a href="#tech">{t('nav.tech')}</a>
        </div>
        <div className="nav-actions">
          <button className="download-pill" onClick={() => document.getElementById('download')?.scrollIntoView()}>
            {t('nav.get_beta')}
          </button>
        </div>
      </nav>

      <section className="panel" id="hero">
        <div className="panel-bg" style={{ backgroundImage: 'url(https://images.unsplash.com/photo-1592478411213-6153e4ebc07d?auto=format&fit=crop&q=80&w=2000)' }}></div>
        <div className="panel-overlay"></div>
        <div className="panel-content hero-content">
          <h1 className="hero-title">
            {t('hero.title')}<br/>
            <span>{t('hero.subtitle_prefix')}</span>
            <span className="rainbow-text">{t('hero.subtitle_highlight')}</span>
          </h1>
          <p className="hero-subtitle">{t('hero.description')}</p>
          <button className="download-pill" onClick={() => document.getElementById('download')?.scrollIntoView()}>{t('hero.cta')}</button>
        </div>
      </section>

      <section id="experience" className="panel">
        <div className="panel-bg" style={{ backgroundImage: 'url(https://images.unsplash.com/photo-1550751827-4bd374c3f58b?auto=format&fit=crop&q=80&w=2000)' }}></div>
        <div className="panel-overlay" style={{ background: 'rgba(0,0,0,0.6)' }}></div>
        <div className="panel-content">
          <h2>{t('experience.title')}</h2>
          <p>{t('experience.description')}</p>
        </div>
      </section>

      <section className="panel rainbow-panel" id="rainbow">
        <div className="rainbow-blur-layer"></div>
        <div className="rainbow-card">
          <div className="panel-content">
            <div className="video-showcase"></div>
            <h2>{t('rainbow.title')}</h2>
            <p>{t('rainbow.description')}</p>
          </div>
        </div>
      </section>

      <section id="tech" className="tech-showcase">
        <div className="final-bento-grid">
          <div className="bento-card mesh-card tall reveal-item">
            <div className="mesh-viz-oval">
              <svg viewBox="0 0 400 400" className="hand-mesh-svg">
                <path d="M200,350 L200,300 L230,260 L250,220 L270,180" className="mesh-line" />
                <path d="M200,300 L190,240 L185,180 L180,120 L178,80" className="mesh-line" />
                <path d="M170,300 L160,230 L155,160 L150,100 L148,60" className="mesh-line" />
                <path d="M140,310 L130,250 L125,190 L120,140 L118,110" className="mesh-line" />
                <path d="M110,330 L90,280 L85,230 L80,190 L78,160" className="mesh-line" />
                <path d="M200,350 L170,300 L140,310 L110,330 L140,370 L200,350" className="mesh-line" />
                {[
                  [200,350], [200,300], [230,260], [250,220], [270,180],
                  [190,240], [185,180], [180,120], [178,80],
                  [170,300], [160,230], [155,160], [150,100], [148,60],
                  [130,250], [125,190], [120,140], [118,110],
                  [90,280], [85,230], [80,190], [78,160], [140,370]
                ].map(([x, y], i) => (
                  <circle key={i} cx={x} cy={y} r="3" className="mesh-dot" />
                ))}
              </svg>
              <div className="scan-bar"></div>
            </div>
          </div>

          <div className="bento-card metrics-card wide reveal-item">
            <div className="metric-item">
              <span className="stat-val">33ms</span>
              <span className="stat-lab">{t('bento.metrics.latency')}</span>
            </div>
            <div className="metric-divider"></div>
            <div className="metric-item">
              <span className="stat-val">99%</span>
              <span className="stat-lab">{t('bento.metrics.accuracy')}</span>
            </div>
            <div className="metric-divider"></div>
            <div className="metric-item">
              <span className="stat-val">30fps</span>
              <span className="stat-lab">{t('bento.metrics.fps')}</span>
            </div>
          </div>

          <div className="bento-card terminal-card black-bg reveal-item">
             <div className="terminal-header">SYSTEM_CORE_LOG</div>
             <div className="log-line">[OK] NEURAL_ENGINE_V1_LOADED</div>
             <div className="log-line">[OK] HAND_GEOMETRY_SYNCED</div>
             <div className="log-line highlight">[SCAN] REALTIME_MAPPING_ACTIVE</div>
          </div>

          <div className="bento-card zero-trust-card tall reveal-item">
            <h3 className="rainbow-text">{t('bento.zero_trust.title')}</h3>
            <p>{t('bento.zero_trust.description')}</p>
          </div>

          <div className="bento-card engine-card reveal-item">
            <h3 className="engine-title rainbow-text">HandMesh Engine</h3>
            <p>{t('bento.system_integration.description')}</p>
          </div>

        </div>
      </section>

      <section id="download" className="panel download-section">
        <div className="panel-content">
          <h2 className="hero-title reveal-text" style={{ color: 'black' }}>{t('download.title')}</h2>
          <div className="beta-tag reveal-text">
            <span>{t('download.beta_tag')}</span>
          </div>
          <div className="download-matrix">
            <div className="download-col">
              <FaWindows size={64} color="#000000" />
              <div className="os-label">{t('download.windows.label')}</div>
              <button className="download-pill" style={{ opacity: 0.4, cursor: 'not-allowed' }}>{t('download.windows.build')}</button>
              <div style={{fontSize: '11px', opacity: 0.5}}>{t('download.windows.soon')}</div>
            </div>
            <div className="download-col">
              <FaLinux size={64} color="#000000" />
              <div className="os-label">{t('download.linux.label')}</div>
              <a href="/releases/gesto-linux.deb" download className="download-pill">{t('download.linux.debian')}</a>
              <a href="/releases/gesto-portable.zip" download className="download-pill" style={{ background: 'white', color: 'black', border: '1px solid #ddd' }}>{t('download.linux.portable')}</a>
            </div>
          </div>
        </div>
      </section>

      <footer className="footer">
        <div className="footer-brand">
          <div className="logo">GESTO<b>.IO</b></div>
          <p style={{ opacity: 0.5, fontSize: '14px', maxWidth: '250px', lineHeight: '1.6' }}>
            {t('footer.description')}
          </p>
        </div>
        <div className="footer-links">
          <h4>{t('footer.product')}</h4>
          <a href="#experience">{t('nav.experience')}</a>
          <a href="#tech">{t('nav.tech')}</a>
        </div>
        <div className="footer-links">
          <h4>{t('footer.legal')}</h4>
          <button onClick={() => setLegalModal({ isOpen: true, type: 'privacy' })}>{t('footer.privacy')}</button>
          <button onClick={() => setLegalModal({ isOpen: true, type: 'terms' })}>{t('footer.terms')}</button>
          <a href="#">Seguridad</a>
        </div>
        <div className="footer-links">
          <h4>{t('footer.development')}</h4>
          <a href="https://github.com/brauliocj">GitHub</a>
          <a href="#">Changelog</a>
        </div>
        
        <div className="footer-bottom">
          <p>{t('footer.copyright')}</p>
          <p>GESTO_ENGINE_STABLE_v1.0</p>
        </div>
      </footer>

      <LegalModal 
        isOpen={legalModal.isOpen} 
        onClose={() => setLegalModal({ ...legalModal, isOpen: false })} 
        type={legalModal.type} 
        t={t}
      />
    </div>
  );
}

export default App;
