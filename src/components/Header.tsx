type HeaderProps = {
  numPeers: number;
};

function Header({ numPeers }: HeaderProps) {
  return (
    <header className="sticky top-0 flex h-16 items-center gap-4 px-1">
      <nav className="w-full font-medium flex flex-row items-center justify-end gap-5 text-sm lg:gap-6">
        <span className="text-sm text-neutral-600 dark:text-neutral-300 flex gap-2 items-center">
          <span className="flex h-2 w-2 relative">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-600"></span>
          </span>
          {numPeers > 0 ? `${numPeers} peers` : "Connecting..."}
        </span>
      </nav>
    </header>
  );
}

export default Header;
