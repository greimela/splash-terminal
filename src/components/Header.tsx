type HeaderProps = {
  numPeers: number;
};

function Header({ numPeers }: HeaderProps) {
  return (
    <div className="flex justify-between items-center mb-4">
      <h1 className="text-3xl font-bold">Splash Terminal</h1>
      <div className="text-sm text-neutral-300">
        {numPeers > 0 ? `Connected to ${numPeers} peers` : 'Connecting...'}
      </div>
    </div>
  );
}

export default Header;