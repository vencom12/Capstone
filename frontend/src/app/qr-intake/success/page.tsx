export default function Success() {
  return (
    <div className="min-h-screen bg-bg-dark text-text-main flex flex-col items-center justify-center p-6 text-center font-sans">
       <div className="glass-card p-10 flex flex-col items-center">
          <div className="w-24 h-24 bg-success/20 text-success rounded-full flex items-center justify-center mb-6 border border-success/30">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
          </div>
          <h1 className="text-4xl font-extrabold text-white mb-4">Intake Secured!</h1>
          <p className="text-text-dim text-lg mb-8">Your information and waiver have been recorded.</p>
          
          <div className="bg-white p-4 rounded-xl mb-8">
             <img src="https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=BYOG-INTAKE-VERIFIED" alt="Verification QR Code" className="w-48 h-48 object-contain" />
          </div>

          <p className="text-primary font-bold text-xl animate-pulse">Please show this screen to the artisan at the counter.</p>
       </div>
    </div>
  );
}
