import React, { useEffect, useState } from 'react';
import {
  ShieldCheck,
  Lock,
  Mail,
  Key,
  User,
  Users,
  Smartphone,
  ArrowRight,
  AlertCircle,
  RefreshCw
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { FinanceAnimatedBackground } from './FinanceAnimatedBackground.tsx';

export const AuthScreen: React.FC = () => {
  const {
    loginWithEmail,
    registerWithEmail,
    sponsorReferralParam
  } = useAuth();

const COUNTRIES = [
    { code: 'AF', name: 'Afghanistan' },
    { code: 'AX', name: 'Åland Islands' },
    { code: 'AL', name: 'Albania' },
    { code: 'DZ', name: 'Algeria' },
    { code: 'AS', name: 'American Samoa' },
    { code: 'AD', name: 'Andorra' },
    { code: 'AO', name: 'Angola' },
    { code: 'AI', name: 'Anguilla' },
    { code: 'AQ', name: 'Antarctica' },
    { code: 'AG', name: 'Antigua and Barbuda' },
    { code: 'AR', name: 'Argentina' },
    { code: 'AM', name: 'Armenia' },
    { code: 'AW', name: 'Aruba' },
    { code: 'AU', name: 'Australia' },
    { code: 'AT', name: 'Austria' },
    { code: 'AZ', name: 'Azerbaijan' },
    { code: 'BS', name: 'Bahamas' },
    { code: 'BH', name: 'Bahrain' },
    { code: 'BD', name: 'Bangladesh' },
    { code: 'BB', name: 'Barbados' },
    { code: 'BY', name: 'Belarus' },
    { code: 'BE', name: 'Belgium' },
    { code: 'BZ', name: 'Belize' },
    { code: 'BJ', name: 'Benin' },
    { code: 'BM', name: 'Bermuda' },
    { code: 'BT', name: 'Bhutan' },
    { code: 'BO', name: 'Bolivia' },
    { code: 'BQ', name: 'Bonaire, Sint Eustatius and Saba' },
    { code: 'BA', name: 'Bosnia and Herzegovina' },
    { code: 'BW', name: 'Botswana' },
    { code: 'BV', name: 'Bouvet Island' },
    { code: 'BR', name: 'Brazil' },
    { code: 'IO', name: 'British Indian Ocean Territory' },
    { code: 'BN', name: 'Brunei Darussalam' },
    { code: 'BG', name: 'Bulgaria' },
    { code: 'BF', name: 'Burkina Faso' },
    { code: 'BI', name: 'Burundi' },
    { code: 'CV', name: 'Cabo Verde' },
    { code: 'KH', name: 'Cambodia' },
    { code: 'CM', name: 'Cameroon' },
    { code: 'CA', name: 'Canada' },
    { code: 'KY', name: 'Cayman Islands' },
    { code: 'CF', name: 'Central African Republic' },
    { code: 'TD', name: 'Chad' },
    { code: 'CL', name: 'Chile' },
    { code: 'CN', name: 'China' },
    { code: 'CX', name: 'Christmas Island' },
    { code: 'CC', name: 'Cocos (Keeling) Islands' },
    { code: 'CO', name: 'Colombia' },
    { code: 'KM', name: 'Comoros' },
    { code: 'CG', name: 'Congo' },
    { code: 'CD', name: 'Congo, Democratic Republic of the' },
    { code: 'CK', name: 'Cook Islands' },
    { code: 'CR', name: 'Costa Rica' },
    { code: 'CI', name: 'Côte d\\'Ivoire' },
    { code: 'HR', name: 'Croatia' },
    { code: 'CU', name: 'Cuba' },
    { code: 'CW', name: 'Curaçao' },
    { code: 'CY', name: 'Cyprus' },
    { code: 'CZ', name: 'Czechia' },
    { code: 'DK', name: 'Denmark' },
    { code: 'DJ', name: 'Djibouti' },
    { code: 'DM', name: 'Dominica' },
    { code: 'DO', name: 'Dominican Republic' },
    { code: 'EC', name: 'Ecuador' },
    { code: 'EG', name: 'Egypt' },
    { code: 'SV', name: 'El Salvador' },
    { code: 'GQ', name: 'Equatorial Guinea' },
    { code: 'ER', name: 'Eritrea' },
    { code: 'EE', name: 'Estonia' },
    { code: 'SZ', name: 'Eswatini' },
    { code: 'ET', name: 'Ethiopia' },
    { code: 'FK', name: 'Falkland Islands' },
    { code: 'FO', name: 'Faroe Islands' },
    { code: 'FJ', name: 'Fiji' },
    { code: 'FI', name: 'Finland' },
    { code: 'FR', name: 'France' },
    { code: 'GF', name: 'French Guiana' },
    { code: 'PF', name: 'French Polynesia' },
    { code: 'TF', name: 'French Southern Territories' },
    { code: 'GA', name: 'Gabon' },
    { code: 'GM', name: 'Gambia' },
    { code: 'GE', name: 'Georgia' },
    { code: 'DE', name: 'Germany' },
    { code: 'GH', name: 'Ghana' },
    { code: 'GI', name: 'Gibraltar' },
    { code: 'GR', name: 'Greece' },
    { code: 'GL', name: 'Greenland' },
    { code: 'GD', name: 'Grenada' },
    { code: 'GP', name: 'Guadeloupe' },
    { code: 'GU', name: 'Guam' },
    { code: 'GT', name: 'Guatemala' },
    { code: 'GG', name: 'Guernsey' },
    { code: 'GN', name: 'Guinea' },
    { code: 'GW', name: 'Guinea-Bissau' },
    { code: 'GY', name: 'Guyana' },
    { code: 'HT', name: 'Haiti' },
    { code: 'HM', name: 'Heard Island and McDonald Islands' },
    { code: 'VA', name: 'Holy See' },
    { code: 'HN', name: 'Honduras' },
    { code: 'HK', name: 'Hong Kong' },
    { code: 'HU', name: 'Hungary' },
    { code: 'IS', name: 'Iceland' },
    { code: 'IN', name: 'India' },
    { code: 'ID', name: 'Indonesia' },
    { code: 'IR', name: 'Iran' },
    { code: 'IQ', name: 'Iraq' },
    { code: 'IE', name: 'Ireland' },
    { code: 'IM', name: 'Isle of Man' },
    { code: 'IL', name: 'Israel' },
    { code: 'IT', name: 'Italy' },
    { code: 'JM', name: 'Jamaica' },
    { code: 'JP', name: 'Japan' },
    { code: 'JE', name: 'Jersey' },
    { code: 'JO', name: 'Jordan' },
    { code: 'KZ', name: 'Kazakhstan' },
    { code: 'KE', name: 'Kenya' },
    { code: 'KI', name: 'Kiribati' },
    { code: 'KP', name: 'North Korea' },
    { code: 'KR', name: 'South Korea' },
    { code: 'KW', name: 'Kuwait' },
    { code: 'KG', name: 'Kyrgyzstan' },
    { code: 'LA', name: 'Laos' },
    { code: 'LV', name: 'Latvia' },
    { code: 'LB', name: 'Lebanon' },
    { code: 'LS', name: 'Lesotho' },
    { code: 'LR', name: 'Liberia' },
    { code: 'LY', name: 'Libya' },
    { code: 'LI', name: 'Liechtenstein' },
    { code: 'LT', name: 'Lithuania' },
    { code: 'LU', name: 'Luxembourg' },
    { code: 'MO', name: 'Macao' },
    { code: 'MG', name: 'Madagascar' },
    { code: 'MW', name: 'Malawi' },
    { code: 'MY', name: 'Malaysia' },
    { code: 'MV', name: 'Maldives' },
    { code: 'ML', name: 'Mali' },
    { code: 'MT', name: 'Malta' },
    { code: 'MH', name: 'Marshall Islands' },
    { code: 'MQ', name: 'Martinique' },
    { code: 'MR', name: 'Mauritania' },
    { code: 'MU', name: 'Mauritius' },
    { code: 'YT', name: 'Mayotte' },
    { code: 'MX', name: 'Mexico' },
    { code: 'FM', name: 'Micronesia' },
    { code: 'MD', name: 'Moldova' },
    { code: 'MC', name: 'Monaco' },
    { code: 'MN', name: 'Mongolia' },
    { code: 'ME', name: 'Montenegro' },
    { code: 'MS', name: 'Montserrat' },
    { code: 'MA', name: 'Morocco' },
    { code: 'MZ', name: 'Mozambique' },
    { code: 'MM', name: 'Myanmar' },
    { code: 'NA', name: 'Namibia' },
    { code: 'NR', name: 'Nauru' },
    { code: 'NP', name: 'Nepal' },
    { code: 'NL', name: 'Netherlands' },
    { code: 'NC', name: 'New Caledonia' },
    { code: 'NZ', name: 'New Zealand' },
    { code: 'NI', name: 'Nicaragua' },
    { code: 'NE', name: 'Niger' },
    { code: 'NG', name: 'Nigeria' },
    { code: 'NU', name: 'Niue' },
    { code: 'NF', name: 'Norfolk Island' },
    { code: 'MK', name: 'North Macedonia' },
    { code: 'MP', name: 'Northern Mariana Islands' },
    { code: 'NO', name: 'Norway' },
    { code: 'OM', name: 'Oman' },
    { code: 'PK', name: 'Pakistan' },
    { code: 'PW', name: 'Palau' },
    { code: 'PS', name: 'Palestine, State of' },
    { code: 'PA', name: 'Panama' },
    { code: 'PG', name: 'Papua New Guinea' },
    { code: 'PY', name: 'Paraguay' },
    { code: 'PE', name: 'Peru' },
    { code: 'PH', name: 'Philippines' },
    { code: 'PN', name: 'Pitcairn' },
    { code: 'PL', name: 'Poland' },
    { code: 'PT', name: 'Portugal' },
    { code: 'PR', name: 'Puerto Rico' },
    { code: 'QA', name: 'Qatar' },
    { code: 'RE', name: 'Réunion' },
    { code: 'RO', name: 'Romania' },
    { code: 'RU', name: 'Russia' },
    { code: 'RW', name: 'Rwanda' },
    { code: 'BL', name: 'Saint Barthélemy' },
    { code: 'SH', name: 'Saint Helena' },
    { code: 'KN', name: 'Saint Kitts and Nevis' },
    { code: 'LC', name: 'Saint Lucia' },
    { code: 'MF', name: 'Saint Martin' },
    { code: 'PM', name: 'Saint Pierre and Miquelon' },
    { code: 'VC', name: 'Saint Vincent and the Grenadines' },
    { code: 'WS', name: 'Samoa' },
    { code: 'SM', name: 'San Marino' },
    { code: 'ST', name: 'Sao Tome and Principe' },
    { code: 'SA', name: 'Saudi Arabia' },
    { code: 'SN', name: 'Senegal' },
    { code: 'RS', name: 'Serbia' },
    { code: 'SC', name: 'Seychelles' },
    { code: 'SL', name: 'Sierra Leone' },
    { code: 'SG', name: 'Singapore' },
    { code: 'SX', name: 'Sint Maarten' },
    { code: 'SK', name: 'Slovakia' },
    { code: 'SI', name: 'Slovenia' },
    { code: 'SB', name: 'Solomon Islands' },
    { code: 'SO', name: 'Somalia' },
    { code: 'ZA', name: 'South Africa' },
    { code: 'GS', name: 'South Georgia and the South Sandwich Islands' },
    { code: 'SS', name: 'South Sudan' },
    { code: 'ES', name: 'Spain' },
    { code: 'LK', name: 'Sri Lanka' },
    { code: 'SD', name: 'Sudan' },
    { code: 'SR', name: 'Suriname' },
    { code: 'SJ', name: 'Svalbard and Jan Mayen' },
    { code: 'SE', name: 'Sweden' },
    { code: 'CH', name: 'Switzerland' },
    { code: 'SY', name: 'Syria' },
    { code: 'TW', name: 'Taiwan' },
    { code: 'TJ', name: 'Tajikistan' },
    { code: 'TZ', name: 'Tanzania' },
    { code: 'TH', name: 'Thailand' },
    { code: 'TL', name: 'Timor-Leste' },
    { code: 'TG', name: 'Togo' },
    { code: 'TK', name: 'Tokelau' },
    { code: 'TO', name: 'Tonga' },
    { code: 'TT', name: 'Trinidad and Tobago' },
    { code: 'TN', name: 'Tunisia' },
    { code: 'TR', name: 'Turkey' },
    { code: 'TM', name: 'Turkmenistan' },
    { code: 'TC', name: 'Turks and Caicos Islands' },
    { code: 'TV', name: 'Tuvalu' },
    { code: 'UG', name: 'Uganda' },
    { code: 'UA', name: 'Ukraine' },
    { code: 'AE', name: 'United Arab Emirates' },
    { code: 'GB', name: 'United Kingdom' },
    { code: 'US', name: 'United States' },
    { code: 'UM', name: 'United States Minor Outlying Islands' },
    { code: 'UY', name: 'Uruguay' },
    { code: 'UZ', name: 'Uzbekistan' },
    { code: 'VU', name: 'Vanuatu' },
    { code: 'VE', name: 'Venezuela' },
    { code: 'VN', name: 'Vietnam' },
    { code: 'VG', name: 'Virgin Islands, British' },
    { code: 'VI', name: 'Virgin Islands, U.S.' },
    { code: 'WF', name: 'Wallis and Futuna' },
    { code: 'EH', name: 'Western Sahara' },
    { code: 'YE', name: 'Yemen' },
    { code: 'ZM', name: 'Zambia' },
    { code: 'ZW', name: 'Zimbabwe' }
  ];

  const isReferralRoute = typeof window !== 'undefined' && window.location.pathname === '/register';
  const [mode, setMode] = useState<'signin' | 'register'>(isReferralRoute ? 'register' : 'signin');
  const [memberId, setMemberId] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [country, setCountry] = useState('IN');
  const [countrySearch, setCountrySearch] = useState('');
  const [sponsorCode, setSponsorCode] = useState(sponsorReferralParam || '');
  const [sponsorName, setSponsorName] = useState('');
  const [sponsorLookupLoading, setSponsorLookupLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (sponsorReferralParam) {
      setSponsorCode(sponsorReferralParam);
      setMode('register');
    }
  }, [sponsorReferralParam]);

  useEffect(() => {
    const code = sponsorCode.trim().toUpperCase();
    setSponsorName('');
    if (!/^GF\d{6}$/.test(code)) {
      setSponsorLookupLoading(false);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        setSponsorLookupLoading(true);
        try {
          const response = await fetch(`/api/referral-lookup?code=${encodeURIComponent(code)}`, { cache: 'no-store' });
          const data = await response.json().catch(() => ({}));
          if (!cancelled && response.ok && data?.valid && data?.sponsor?.name) {
            setSponsorName(String(data.sponsor.name));
          }
        } catch (error) {
          if (!cancelled) console.warn('Sponsor lookup unavailable:', error);
        } finally {
          if (!cancelled) setSponsorLookupLoading(false);
        }
      })();
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [sponsorCode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    setLoading(true);
    try {
      if (mode === 'signin') {
        await loginWithEmail(memberId.trim().toUpperCase(), password);
      } else {
        if (!name.trim()) throw new Error('Please enter your full name');
        await registerWithEmail(name.trim(), email.trim(), password, sponsorCode.trim(), phone.trim());
        setMode('signin');
        setMemberId('');
        setEmail('');
        setPassword('');
        setName('');
        setPhone('');
        setSponsorCode('');
        setSuccessMsg('Registration successful. Please sign in with your GF Member ID and password.');
        window.history.replaceState({}, '', '/');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Authentication failed. Please verify credentials.');
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-[#020817] flex flex-col justify-center items-center p-4 sm:p-6 relative overflow-hidden isolate">
      <FinanceAnimatedBackground />
      <div className="absolute inset-0 pointer-events-none bg-gradient-to-b from-[#020817]/10 via-transparent to-[#020817]/55" />

      <div className="text-center mb-5 sm:mb-6 z-10 relative select-none">
        <img
          src="/global-finance-logo.webp"
          alt="Global Finance"
          className="w-[170px] sm:w-[210px] h-auto mx-auto drop-shadow-[0_0_24px_rgba(0,217,255,.24)]"
          decoding="async"
        />
        <h1 className="mt-2 text-2xl sm:text-3xl font-extrabold tracking-[0.08em] text-white drop-shadow-[0_2px_16px_rgba(0,217,255,.24)]">
          GLOBAL FINANCE
        </h1>
        <p className="mt-1 text-xs sm:text-sm font-medium tracking-wide text-cyan-200">
          Secure • Transparent • Digital Finance Platform
        </p>
      </div>

      <div className="w-full max-w-md relative z-10 rounded-[24px] border border-cyan-400/25 bg-[#071126]/78 p-6 sm:p-8 shadow-[0_28px_90px_rgba(0,0,0,.55),0_0_45px_rgba(20,120,255,.12)] backdrop-blur-2xl ring-1 ring-white/[0.04] before:absolute before:inset-px before:rounded-[23px] before:pointer-events-none before:bg-gradient-to-br before:from-white/[0.035] before:via-transparent before:to-cyan-400/[0.025]">
        <div className="relative z-[1]">
          <div className="grid grid-cols-2 p-1 bg-[#030817]/85 rounded-xl border border-blue-500/20 mb-6 shadow-inner shadow-black/20">
            <button type="button" onClick={() => { setMode('signin'); setErrorMsg(''); setSuccessMsg(''); }} className={`py-2 text-xs font-bold rounded-lg transition-all ${mode === 'signin' ? 'bg-gradient-to-r from-blue-600 to-cyan-600 text-white shadow-md shadow-cyan-950/40' : 'text-slate-400 hover:text-white'}`}>GF ID Login</button>
            <button type="button" onClick={() => { setMode('register'); setErrorMsg(''); setSuccessMsg(''); }} className={`py-2 text-xs font-bold rounded-lg transition-all ${mode === 'register' ? 'bg-gradient-to-r from-blue-600 to-cyan-600 text-white shadow-md shadow-cyan-950/40' : 'text-slate-400 hover:text-white'}`}>New Account</button>
          </div>

          {sponsorReferralParam && mode === 'register' && (
            <div className="mb-4 p-3 rounded-xl bg-cyan-500/10 border border-cyan-400/30 text-cyan-200 text-xs">
              Referral link detected. Sponsor Member ID <span className="font-mono font-bold text-white">{sponsorReferralParam}</span> will be attached to this new account.
            </div>
          )}

          {successMsg && <div className="mb-4 p-3 rounded-xl bg-emerald-950/45 border border-emerald-500/40 text-emerald-300 text-xs">{successMsg}</div>}
          {errorMsg && <div className="mb-4 p-3 rounded-xl bg-rose-950/45 border border-rose-500/40 text-rose-300 text-xs flex items-center gap-2 shadow-lg shadow-rose-950/15"><AlertCircle className="w-4 h-4 shrink-0" /><span>{errorMsg}</span></div>}







          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && <>
              <div><label className="block text-xs font-semibold text-slate-300 mb-1">Full Name</label><div className="relative"><User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"/><input type="text" placeholder="Enter your name" value={name} onChange={(e)=>setName(e.target.value)} required className="w-full pl-9 pr-3.5 py-2.5 rounded-xl bg-[#081632]/90 border border-blue-400/25 text-white text-xs focus:outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/10 transition-shadow"/></div></div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Sponsor Member ID</label>
                <div className="relative"><Users className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"/><input type="text" placeholder="GF123456" value={sponsorCode} readOnly={Boolean(sponsorReferralParam)} onChange={(e)=>setSponsorCode(e.target.value.toUpperCase())} className={`w-full pl-9 pr-3.5 py-2.5 rounded-xl border text-cyan-300 font-mono text-xs uppercase transition-shadow ${sponsorReferralParam ? 'bg-cyan-950/30 border-cyan-400/40 cursor-not-allowed' : 'bg-[#081632]/90 border-blue-400/25 focus:outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/10'}`}/></div>
                {sponsorReferralParam && <p className="mt-1 text-[10px] text-cyan-300">Referral sponsor locked from the referral link.</p>}
                {/^GF\d{6}$/.test(sponsorCode.trim().toUpperCase()) && (
                  <div className="mt-2 flex items-center gap-2 rounded-lg bg-cyan-500/10 border border-cyan-400/20 px-3 py-2 text-[10px]">
                    <Users className="w-3.5 h-3.5 text-cyan-400 shrink-0"/>
                    <span className="text-slate-400">Referred by:</span>
                    {sponsorLookupLoading ? <span className="text-cyan-300">Checking sponsor...</span> : sponsorName ? <span className="font-semibold text-white">{sponsorName}</span> : <span className="text-amber-300">Active sponsor not found</span>}
                  </div>
                )}
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Primary Mobile Number</label>
                <div className="relative"><Smartphone className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"/><input type="tel" inputMode="tel" placeholder="+91XXXXXXXXXX" value={phone} onChange={(e)=>setPhone(e.target.value)} className="w-full pl-9 pr-3.5 py-2.5 rounded-xl bg-[#081632]/90 border border-blue-400/25 text-white text-xs font-mono focus:outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/10"/></div>
              </div>
            </>}
            {mode === 'signin' ? (
              <>
                <div><label className="block text-xs font-semibold text-slate-300 mb-1">GF Member ID or Email Address</label><div className="relative"><Users className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"/><input type="text" placeholder="GF165099 or name@example.com" value={memberId} onChange={(e)=>setMemberId(e.target.value)} required autoComplete="username" className="w-full pl-9 pr-3.5 py-2.5 rounded-xl bg-[#081632]/90 border border-blue-400/25 text-cyan-200 focus:outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/10 transition-shadow"/></div></div>
              </>
            ) : (
              <div><label className="block text-xs font-semibold text-slate-300 mb-1">Email Address</label><div className="relative"><Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"/><input type="email" placeholder="name@example.com" value={email} onChange={(e)=>setEmail(e.target.value)} required className="w-full pl-9 pr-3.5 py-2.5 rounded-xl bg-[#081632]/90 border border-blue-400/25 text-white text-xs focus:outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/10 transition-shadow"/></div></div>
            )}
            <div><label className="block text-xs font-semibold text-slate-300 mb-1">Password</label><div className="relative"><Key className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"/><input type="password" name="password" placeholder="••••••••" value={password} onChange={(e)=>setPassword(e.target.value)} required minLength={6} autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} autoCapitalize="none" spellCheck={false} className="w-full pl-9 pr-3.5 py-2.5 rounded-xl bg-[#081632]/90 border border-blue-400/25 text-white text-xs focus:outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/10 transition-shadow normal-case"/></div></div>
            <button type="submit" disabled={loading} className="w-full py-3 rounded-xl bg-gradient-to-r from-blue-600 via-cyan-600 to-teal-600 hover:from-blue-500 hover:to-teal-500 text-white font-bold text-xs shadow-lg shadow-cyan-950/45 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">{loading ? <><RefreshCw className="w-4 h-4 animate-spin"/><span>Authenticating with Global Finance Ledger...</span></> : <><span>{mode === 'signin' ? 'Sign In to Dashboard' : 'Create Global Finance Account'}</span><ArrowRight className="w-4 h-4"/></>}</button>
          </form>

          {mode === 'signin' && <p className="mt-3 text-center text-[10px] text-slate-500">Login with your GF Member ID or email address and account password. T-Password is only for withdrawal/security verification.</p>}

          <div className="mt-6 pt-4 border-t border-blue-400/15 flex flex-wrap items-center justify-center gap-2.5 text-[11px] text-slate-400"><div className="flex items-center gap-1"><Lock className="w-3.5 h-3.5 text-emerald-400"/><span>256-bit Encrypted</span></div><span className="text-slate-600">•</span><div className="flex items-center gap-1"><ShieldCheck className="w-3.5 h-3.5 text-cyan-400"/><span>Secure Ledger Controls</span></div></div>
        </div>
      </div>

      <div className="mt-6 text-[11px] text-slate-500 text-center z-10 relative">© 2026 Global Finance. All Rights Reserved.</div>
    </div>
  );
};
