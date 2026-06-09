"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_LINKS = [
  { href: "/",               label: "Home" },
  { href: "/buenos-aires",   label: "Buenos Aires" },
  { href: "/longoes",        label: "Longões" },
  { href: "/corridas-brasil",label: "Brasil" },
  { href: "/corridas-mundo", label: "Mundo" },
  { href: "/equipamentos",   label: "Tênis" },
  { href: "/sisrun",         label: "SisRUN" },
];

type Props = {
  athleteName?: string;
  athleteAvatar?: string;
};

export default function Navbar({ athleteName, athleteAvatar }: Props) {
  const pathname = usePathname();

  return (
    <>
      <style>{`
        .tsm-nav {
          position: sticky;
          top: 0;
          z-index: 50;
          width: 100%;
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          background: rgba(247, 238, 243, 0.85);
          border-bottom: 1.5px solid rgba(224, 0, 122, 0.15);
        }
        .tsm-nav__inner {
          max-width: 1280px;
          margin: 0 auto;
          padding: 0 1.25rem;
          height: 52px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1rem;
        }
        .tsm-nav__brand {
          display: flex;
          align-items: center;
          gap: 0.6rem;
          flex-shrink: 0;
        }
        .tsm-nav__avatar {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          border: 1.5px solid rgba(224, 0, 122, 0.3);
          object-fit: cover;
        }
        .tsm-nav__logo {
          font-size: 13px;
          font-weight: 700;
          letter-spacing: 0.08em;
          color: #8a1452;
          text-decoration: none;
        }
        .tsm-nav__dot {
          width: 5px;
          height: 5px;
          border-radius: 50%;
          background: #e0007a;
          flex-shrink: 0;
        }
        .tsm-nav__links {
          display: flex;
          align-items: center;
          gap: 0.15rem;
          overflow-x: auto;
          scrollbar-width: none;
          -ms-overflow-style: none;
        }
        .tsm-nav__links::-webkit-scrollbar { display: none; }
        .tsm-nav__link {
          padding: 5px 11px;
          border-radius: 999px;
          font-size: 12.5px;
          font-weight: 500;
          color: #8a1452;
          text-decoration: none;
          white-space: nowrap;
          transition: background 0.15s, color 0.15s;
          opacity: 0.7;
        }
        .tsm-nav__link:hover {
          background: rgba(224, 0, 122, 0.08);
          opacity: 1;
        }
        .tsm-nav__link--active {
          background: rgba(224, 0, 122, 0.12);
          color: #c0006b;
          opacity: 1;
          font-weight: 600;
        }
      `}</style>
      <nav className="tsm-nav">
        <div className="tsm-nav__inner">
          <div className="tsm-nav__brand">
            {athleteAvatar && (
              <img src={athleteAvatar} alt="" className="tsm-nav__avatar" />
            )}
            <Link href="/" className="tsm-nav__logo">
              {athleteName?.toUpperCase() ?? "TSM"}
            </Link>
            <span className="tsm-nav__dot" />
          </div>
          <div className="tsm-nav__links">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`tsm-nav__link${pathname === link.href ? " tsm-nav__link--active" : ""}`}
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      </nav>
    </>
  );
}
