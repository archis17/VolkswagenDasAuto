import { motion, useScroll, useTransform } from 'framer-motion';
import { Link } from 'react-router-dom';
import { 
  Navigation as NavigationIcon,
  Map,
  Bell,
  Shield,
  Brain,
  TrendingUp,
  Camera,
  MapPin,
  AlertTriangle,
  ArrowRight,
  Github,
  Linkedin,
  Twitter,
  Car,
  Navigation2,
  Zap
} from 'lucide-react';
import { useState, useEffect } from 'react';
import PWAInstallPrompt from './PWAInstallPrompt';

// Animated Road Component
function AnimatedRoad() {
  return (
    <div className="relative w-full h-full">
      {/* Road lines animation */}
      <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
        {/* Animated road */}
        <div className="relative w-64 h-full bg-gradient-to-b from-transparent via-gray-700 to-transparent opacity-30">
          {/* Moving lane markers */}
          {[...Array(8)].map((_, i) => (
            <motion.div
              key={i}
              className="absolute left-1/2 transform -translate-x-1/2 w-2 h-12 bg-white rounded"
              initial={{ top: `${i * -15}%` }}
              animate={{ top: '120%' }}
              transition={{
                duration: 2,
                repeat: Infinity,
                delay: i * 0.3,
                ease: 'linear'
              }}
            />
          ))}
        </div>
        
        {/* Animated cars */}
        <motion.div
          className="absolute right-20 top-1/4"
          animate={{ 
            y: [0, 400],
            scale: [0.8, 1.2, 0.8]
          }}
          transition={{
            duration: 4,
            repeat: Infinity,
            ease: 'linear'
          }}
        >
          <Car className="text-[#3498db] w-16 h-16" />
        </motion.div>
        
        <motion.div
          className="absolute left-20 top-1/2"
          animate={{ 
            y: [400, 0],
            scale: [0.8, 1.2, 0.8]
          }}
          transition={{
            duration: 3.5,
            repeat: Infinity,
            ease: 'linear',
            delay: 2
          }}
        >
          <Car className="text-[#e74c3c] w-12 h-12" />
        </motion.div>

        {/* Navigation waypoint */}
        <motion.div
          className="absolute top-1/3 left-1/3"
          animate={{ 
            scale: [1, 1.3, 1],
            opacity: [0.5, 1, 0.5]
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
          }}
        >
          <Navigation2 className="text-[#2ecc71] w-10 h-10" />
        </motion.div>
      </div>
    </div>
  );
}

// Navigation Component with Glass Morphism and Scroll Effect
function Navigation() {
  const [scrolled, setScrolled] = useState(false);
  const { scrollY } = useScroll();
  const navY = useTransform(scrollY, [0, 100], [0, -10]);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 50);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <motion.nav
      initial={{ y: -100 }}
      animate={{ y: 0 }}
      style={{ y: navY }}
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
        scrolled 
          ? 'bg-white/80 backdrop-blur-lg shadow-lg' 
          : 'bg-transparent'
      }`}
    >
      <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
        <motion.div 
          className="text-2xl font-bold"
          whileHover={{ scale: 1.05 }}
        >
          <div className="flex items-center gap-2">
            <NavigationIcon className={`${scrolled ? 'text-[#3498db]' : 'text-white'}`} />
            <span className={`bg-gradient-to-r from-[#3498db] to-[#2c3e50] bg-clip-text text-transparent`}>Hazard Eye</span>
          </div>
        </motion.div>
        
        <div className="hidden md:flex gap-8 items-center">
          <motion.a 
            href="#features" 
            className={`${scrolled ? 'text-gray-700' : 'text-white'} hover:text-[#3498db] transition-colors`}
            whileHover={{ y: -2 }}
          >
            Features
          </motion.a>
          <motion.a 
            href="#how-it-works" 
            className={`${scrolled ? 'text-gray-700' : 'text-white'} hover:text-[#3498db] transition-colors`}
            whileHover={{ y: -2 }}
          >
            How It Works
          </motion.a>
          <motion.a 
            href="#technology" 
            className={`${scrolled ? 'text-gray-700' : 'text-white'} hover:text-[#3498db] transition-colors`}
            whileHover={{ y: -2 }}
          >
            Technology
          </motion.a>
          <Link to="/live">
            <motion.button
              whileHover={{ scale: 1.05, boxShadow: "0 10px 30px rgba(52, 152, 219, 0.4)" }}
              whileTap={{ scale: 0.95 }}
              className="px-6 py-2 bg-gradient-to-r from-[#3498db] to-[#2980b9] text-white rounded-full font-semibold shadow-lg flex items-center gap-2"
            >
              Get Started
              <ArrowRight className="w-4 h-4" />
            </motion.button>
          </Link>
        </div>
      </div>
    </motion.nav>
  );
}

// Hero Section with Road Animation
function HeroSection() {
  const { scrollY } = useScroll();
  const opacity = useTransform(scrollY, [0, 300], [1, 0]);
  const scale = useTransform(scrollY, [0, 300], [1, 0.8]);

  return (
    <motion.section 
      style={{ opacity, scale }}
      className="relative min-h-screen flex items-center justify-center overflow-hidden bg-gradient-to-br from-[#1a1a2e] via-[#16213e] to-[#0f3460]"
    >
      {/* Animated road grid background */}
      <div className="absolute inset-0 overflow-hidden opacity-20">
        <div className="absolute inset-0" style={{
          backgroundImage: 'linear-gradient(0deg, transparent 24%, rgba(52, 152, 219, .3) 25%, rgba(52, 152, 219, .3) 26%, transparent 27%, transparent 74%, rgba(52, 152, 219, .3) 75%, rgba(52, 152, 219, .3) 76%, transparent 77%, transparent), linear-gradient(90deg, transparent 24%, rgba(52, 152, 219, .3) 25%, rgba(52, 152, 219, .3) 26%, transparent 27%, transparent 74%, rgba(52, 152, 219, .3) 75%, rgba(52, 152, 219, .3) 76%, transparent 77%, transparent)',
          backgroundSize: '50px 50px'
        }}>
        </div>
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-6 py-20 grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
        {/* Left Content */}
        <motion.div
          initial={{ opacity: 0, x: -50 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.8 }}
        >
          <motion.h1 
            className="text-6xl lg:text-7xl font-extrabold text-white mb-6 leading-tight"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            AI-Powered
            <br />
            <span className="bg-gradient-to-r from-[#3498db] to-[#2ecc71] bg-clip-text text-transparent">
              Road Safety
            </span>
          </motion.h1>
          
          <motion.p 
            className="text-xl text-gray-300 mb-8 leading-relaxed"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
          >
            Detect road hazards in real-time using advanced YOLO AI technology. 
            Protect drivers, save lives, and make roads safer for everyone.
          </motion.p>

          <motion.div 
            className="flex flex-col sm:flex-row gap-4"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
          >
            <Link to="/live">
              <motion.button
                whileHover={{ scale: 1.05, boxShadow: "0 20px 40px rgba(52, 152, 219, 0.4)" }}
                whileTap={{ scale: 0.95 }}
                className="px-8 py-4 bg-gradient-to-r from-[#3498db] to-[#2980b9] text-white rounded-full font-bold text-lg shadow-xl flex items-center gap-3 hover:shadow-2xl transition-all group"
              >
                <Camera className="w-5 h-5" />
                Start Detection
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </motion.button>
            </Link>
            
            <Link to="/pothole-map">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="px-8 py-4 bg-white/10 backdrop-blur-lg text-white rounded-full font-bold text-lg border-2 border-white/30 flex items-center gap-3"
              >
                <MapPin className="w-5 h-5" />
                View Map
              </motion.button>
            </Link>
          </motion.div>

          {/* Stats */}
          <motion.div 
            className="grid grid-cols-3 gap-6 mt-12"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8 }}
          >
            <div className="text-center">
              <div className="text-3xl font-bold text-[#3498db]">98%</div>
              <div className="text-sm text-gray-400 mt-1">Accuracy</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-[#2ecc71]">24/7</div>
              <div className="text-sm text-gray-400 mt-1">Monitoring</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-[#e74c3c]">Real-time</div>
              <div className="text-sm text-gray-400 mt-1">Detection</div>
            </div>
          </motion.div>
        </motion.div>

        {/* Right Road Animation */}
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1 }}
          className="h-[500px] relative"
        >
          <AnimatedRoad />
          
          {/* Floating cards */}
          <motion.div
            animate={{ y: [0, -20, 0] }}
            transition={{ duration: 3, repeat: Infinity }}
            className="absolute top-10 right-10 bg-white/10 backdrop-blur-lg p-4 rounded-xl border border-white/20 shadow-xl"
          >
            <AlertTriangle className="text-[#e74c3c] w-8 h-8 mb-2" />
            <div className="text-white text-sm font-semibold">Hazard Detected</div>
          </motion.div>

          <motion.div
            animate={{ y: [0, 20, 0] }}
            transition={{ duration: 3, repeat: Infinity, delay: 1.5 }}
            className="absolute bottom-20 left-10 bg-white/10 backdrop-blur-lg p-4 rounded-xl border border-white/20 shadow-xl"
          >
            <Shield className="text-[#2ecc71] w-8 h-8 mb-2" />
            <div className="text-white text-sm font-semibold">Protected Route</div>
          </motion.div>

          <motion.div
            animate={{ 
              scale: [1, 1.1, 1],
              rotate: [0, 5, -5, 0]
            }}
            transition={{ duration: 4, repeat: Infinity, delay: 0.5 }}
            className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-white/10 backdrop-blur-lg p-4 rounded-full border border-white/20 shadow-xl"
          >
            <Zap className="text-[#f39c12] w-10 h-10" />
          </motion.div>
        </motion.div>
      </div>

      {/* Scroll indicator */}
      <motion.div
        animate={{ y: [0, 10, 0] }}
        transition={{ duration: 1.5, repeat: Infinity }}
        className="absolute bottom-10 left-1/2 transform -translate-x-1/2"
      >
        <div className="w-6 h-10 border-2 border-white/30 rounded-full flex justify-center">
          <div className="w-1 h-3 bg-white rounded-full mt-2"></div>
        </div>
      </motion.div>
    </motion.section>
  );
}

// Features Section with Scroll Animations
function FeaturesSection() {
  const { scrollY } = useScroll();
  const y = useTransform(scrollY, [0, 500], [100, 0]);

  const features = [
    {
      icon: <Brain className="w-8 h-8" />,
      title: "AI-Powered Detection",
      description: "Advanced YOLO neural networks for accurate real-time hazard identification",
      color: "#3498db",
      gradient: "from-[#3498db] to-[#2980b9]"
    },
    {
      icon: <Camera className="w-8 h-8" />,
      title: "Live Camera Feed",
      description: "Continuous monitoring through integrated camera systems with instant processing",
      color: "#2ecc71",
      gradient: "from-[#2ecc71] to-[#27ae60]"
    },
    {
      icon: <MapPin className="w-8 h-8" />,
      title: "GPS Integration",
      description: "Precise location tracking with PostGIS for accurate hazard mapping",
      color: "#e74c3c",
      gradient: "from-[#e74c3c] to-[#c0392b]"
    },
    {
      icon: <Bell className="w-8 h-8" />,
      title: "Instant Alerts",
      description: "Automatic notifications to authorities when critical hazards are detected",
      color: "#f39c12",
      gradient: "from-[#f39c12] to-[#e67e22]"
    },
    {
      icon: <Shield className="w-8 h-8" />,
      title: "Smart Deduplication",
      description: "Redis-powered caching prevents duplicate reports and reduces false alarms",
      color: "#9b59b6",
      gradient: "from-[#9b59b6] to-[#8e44ad]"
    },
    {
      icon: <TrendingUp className="w-8 h-8" />,
      title: "Analytics Dashboard",
      description: "Comprehensive insights into road conditions and hazard patterns",
      color: "#1abc9c",
      gradient: "from-[#1abc9c] to-[#16a085]"
    }
  ];

  return (
    <motion.section 
      id="features" 
      style={{ y }}
      className="py-20 bg-gradient-to-br from-[#f5f7fa] to-[#c3cfe2]"
    >
      <div className="max-w-7xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
          className="text-center mb-16"
        >
          <h2 className="text-5xl font-extrabold text-[#2c3e50] mb-4">
            Powerful Features
          </h2>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Cutting-edge technology designed to make roads safer for everyone
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((feature, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 50 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              whileHover={{ y: -10, scale: 1.02, boxShadow: "0 20px 40px rgba(0,0,0,0.1)" }}
              className="bg-white rounded-2xl p-8 shadow-lg hover:shadow-2xl transition-all duration-300 group cursor-pointer"
            >
              <motion.div 
                className={`w-16 h-16 bg-gradient-to-br ${feature.gradient} rounded-xl flex items-center justify-center text-white mb-6`}
                whileHover={{ scale: 1.1, rotate: 5 }}
                transition={{ type: "spring", stiffness: 300 }}
              >
                {feature.icon}
              </motion.div>
              
              <h3 className="text-2xl font-bold text-[#2c3e50] mb-4">
                {feature.title}
              </h3>
              
              <p className="text-gray-600 leading-relaxed">
                {feature.description}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </motion.section>
  );
}

// How It Works Section with Scroll Progress
function HowItWorksSection() {
  const { scrollYProgress } = useScroll();
  const scaleProgress = useTransform(scrollYProgress, [0.3, 0.5], [0.8, 1]);
  
  const steps = [
    {
      number: "01",
      title: "Capture",
      description: "Camera captures live road footage or processes uploaded videos",
      icon: <Camera className="w-8 h-8" />
    },
    {
      number: "02",
      title: "Analyze",
      description: "YOLO AI models analyze frames detecting potholes, speedbumps, and obstacles",
      icon: <Brain className="w-8 h-8" />
    },
    {
      number: "03",
      title: "Locate",
      description: "GPS coordinates are extracted and validated with PostGIS",
      icon: <MapPin className="w-8 h-8" />
    },
    {
      number: "04",
      title: "Alert",
      description: "Authorities receive instant notifications with precise location data",
      icon: <Bell className="w-8 h-8" />
    }
  ];

  return (
    <motion.section 
      id="how-it-works" 
      style={{ scale: scaleProgress }}
      className="py-20 bg-gradient-to-br from-[#1a1a2e] to-[#2c3e50]"
    >
      <div className="max-w-7xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <h2 className="text-5xl font-extrabold text-white mb-4">
            How It Works
          </h2>
          <p className="text-xl text-gray-300 max-w-2xl mx-auto">
            A seamless four-step process from detection to action
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {steps.map((step, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, x: index % 2 === 0 ? -50 : 50 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ duration: 0.6, delay: index * 0.15, type: "spring" }}
              className="relative"
            >
              {/* Connection line with animation */}
              {index < steps.length - 1 && (
                <motion.div 
                  initial={{ scaleX: 0 }}
                  whileInView={{ scaleX: 1 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.8, delay: index * 0.15 + 0.3 }}
                  className="hidden lg:block absolute top-16 left-full w-full h-0.5 bg-gradient-to-r from-[#3498db] to-transparent -z-10 origin-left"
                />
              )}
              
              <motion.div
                whileHover={{ scale: 1.05, y: -5 }}
                transition={{ type: "spring", stiffness: 300 }}
                className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 border border-white/20 text-center"
              >
                <div className="text-6xl font-bold text-[#3498db]/20 mb-4">
                  {step.number}
                </div>
                
                <div className="w-16 h-16 bg-gradient-to-br from-[#3498db] to-[#2980b9] rounded-full flex items-center justify-center text-white text-3xl mx-auto mb-6">
                  {step.icon}
                </div>
                
                <h3 className="text-2xl font-bold text-white mb-4">
                  {step.title}
                </h3>
                
                <p className="text-gray-300 leading-relaxed">
                  {step.description}
                </p>
              </motion.div>
            </motion.div>
          ))}
        </div>
      </div>
    </motion.section>
  );
}

// Technology Stack Section
function TechnologySection() {
  const technologies = [
    { name: "YOLOv8", description: "Object Detection", color: "#3498db" },
    { name: "React", description: "Frontend Framework", color: "#61dafb" },
    { name: "FastAPI", description: "Backend Server", color: "#009688" },
    { name: "WebSocket", description: "Real-time Streaming", color: "#e74c3c" },
    { name: "PostgreSQL", description: "PostGIS Database", color: "#336791" },
    { name: "Redis", description: "Caching Layer", color: "#dc382d" },
    { name: "OpenCV", description: "Computer Vision", color: "#5c3ee8" },
    { name: "PyTorch", description: "Deep Learning", color: "#ee4c2c" }
  ];

  return (
    <section id="technology" className="py-20 bg-white">
      <div className="max-w-7xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <h2 className="text-5xl font-extrabold text-[#2c3e50] mb-4">
            Built With Modern Technology
          </h2>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Leveraging the best tools and frameworks for optimal performance
          </p>
        </motion.div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {technologies.map((tech, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, scale: 0.8 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: index * 0.05 }}
              whileHover={{ scale: 1.1, rotate: 5 }}
              className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl p-6 text-center shadow-md hover:shadow-xl transition-all"
              style={{ borderTop: `4px solid ${tech.color}` }}
            >
              <div 
                className="text-3xl font-bold mb-2"
                style={{ color: tech.color }}
              >
                {tech.name}
              </div>
              <div className="text-sm text-gray-600">
                {tech.description}
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

// CTA Section
function CTASection() {
  return (
    <section className="py-20 bg-gradient-to-r from-[#3498db] to-[#2c3e50] relative overflow-hidden">
      <div className="absolute inset-0 opacity-10">
        <div className="absolute top-0 left-0 w-96 h-96 bg-white rounded-full filter blur-3xl"></div>
        <div className="absolute bottom-0 right-0 w-96 h-96 bg-white rounded-full filter blur-3xl"></div>
      </div>
      
      <div className="max-w-4xl mx-auto px-6 text-center relative z-10">
        <motion.h2
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-5xl font-extrabold text-white mb-6"
        >
          Ready to Make Roads Safer?
        </motion.h2>
        
        <motion.p
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.2 }}
          className="text-xl text-white/90 mb-10"
        >
          Start detecting road hazards in real-time with our AI-powered system
        </motion.p>
        
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.4 }}
          className="flex flex-col sm:flex-row gap-4 justify-center"
        >
          <Link to="/live">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="px-10 py-4 bg-white text-[#3498db] rounded-full font-bold text-lg shadow-xl hover:shadow-2xl transition-all"
            >
              Start Now
            </motion.button>
          </Link>
          
          <Link to="/pothole-map">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="px-10 py-4 bg-transparent border-2 border-white text-white rounded-full font-bold text-lg hover:bg-white hover:text-[#3498db] transition-all"
            >
              Explore Map
            </motion.button>
          </Link>
        </motion.div>
      </div>
    </section>
  );
}

// Footer
function Footer() {
  return (
    <footer className="bg-[#1a1a2e] text-white py-12">
      <div className="max-w-7xl mx-auto px-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
          <div>
            <h3 className="text-2xl font-bold bg-gradient-to-r from-[#3498db] to-[#2ecc71] bg-clip-text text-transparent mb-4">
              Hazard Eye
            </h3>
            <p className="text-gray-400 leading-relaxed">
              AI-powered road hazard detection system making roads safer for everyone through advanced technology.
            </p>
          </div>
          
          <div>
            <h4 className="text-lg font-semibold mb-4">Quick Links</h4>
            <ul className="space-y-2">
              <li><Link to="/live" className="text-gray-400 hover:text-[#3498db] transition-colors">Live Detection</Link></li>
              <li><Link to="/pothole-map" className="text-gray-400 hover:text-[#3498db] transition-colors">Hazard Map</Link></li>
              <li><a href="#features" className="text-gray-400 hover:text-[#3498db] transition-colors">Features</a></li>
              <li><a href="#technology" className="text-gray-400 hover:text-[#3498db] transition-colors">Technology</a></li>
            </ul>
          </div>
          
          <div>
            <h4 className="text-lg font-semibold mb-4">Connect</h4>
            <div className="flex gap-4">
              <motion.a
                whileHover={{ scale: 1.2, rotate: 5 }}
                href="#"
                className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center hover:bg-[#3498db] transition-colors"
              >
                <Github className="w-5 h-5" />
              </motion.a>
              <motion.a
                whileHover={{ scale: 1.2, rotate: 5 }}
                href="#"
                className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center hover:bg-[#0077b5] transition-colors"
              >
                <Linkedin className="w-5 h-5" />
              </motion.a>
              <motion.a
                whileHover={{ scale: 1.2, rotate: 5 }}
                href="#"
                className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center hover:bg-[#1da1f2] transition-colors"
              >
                <Twitter className="w-5 h-5" />
              </motion.a>
            </div>
          </div>
        </div>
        
        <div className="border-t border-white/10 pt-8 text-center text-gray-400">
          <p>© 2025 Hazard Eye | Powered by YOLO & Advanced AI | Making Roads Safer</p>
        </div>
      </div>
    </footer>
  );
}

// Main Landing Page Component
export default function LandingPage() {
  return (
    <div className="min-h-screen">
      <Navigation />
      <HeroSection />
      <FeaturesSection />
      <HowItWorksSection />
      <TechnologySection />
      <CTASection />
      <Footer />
      <PWAInstallPrompt />
    </div>
  );
}
