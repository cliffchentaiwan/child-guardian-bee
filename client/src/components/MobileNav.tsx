/**
 * 兒少守護小蜂 - 手機版底部導航
 * Mobile-first navigation for quick access on the go
 */

import { Link, useLocation } from 'wouter';
import { motion } from 'framer-motion';
import { 
  AlertTriangle, 
  BookOpen,
  Home
} from 'lucide-react';

const navItems = [
  { path: '/', label: '首頁', icon: Home },
  { path: '/report', label: '通報', icon: AlertTriangle, highlight: true },
  { path: '/education', label: '教育', icon: BookOpen },
];

export default function MobileNav() {
  const [location] = useLocation();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-md border-t border-honey-light/30 md:hidden safe-area-bottom">
      <div className="flex items-center justify-around py-2 px-4">
        {navItems.map((item) => {
          const isActive = location === item.path;
          const Icon = item.icon;
          
          return (
            <Link key={item.path} href={item.path}>
              <motion.div
                whileTap={{ scale: 0.9 }}
                className={`flex flex-col items-center gap-1 px-4 py-2 rounded-xl transition-colors ${
                  item.highlight 
                    ? 'bg-warning-coral text-white' 
                    : isActive 
                      ? 'text-honey-dark' 
                      : 'text-muted-foreground'
                }`}
              >
                <Icon className={`w-5 h-5 ${item.highlight ? '' : isActive ? 'text-honey' : ''}`} />
                <span className={`text-xs font-medium ${item.highlight ? 'text-white' : ''}`}>
                  {item.label}
                </span>
                {isActive && !item.highlight && (
                  <motion.div
                    layoutId="activeTab"
                    className="absolute bottom-1 w-1 h-1 bg-honey rounded-full"
                  />
                )}
              </motion.div>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
