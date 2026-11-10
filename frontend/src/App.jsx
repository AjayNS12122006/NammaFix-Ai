import { useEffect, useMemo, useRef, useState } from 'react'
import {
  BrowserRouter,
  Link,
  NavLink,
  Route,
  Routes,
  useNavigate,
  useParams,
} from 'react-router-dom'
import axios from 'axios'
import { MapContainer, Marker, Popup, TileLayer, CircleMarker } from 'react-leaflet'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  ChevronRight,
  Clock3,
  FileText,
  Globe,
  MapPin,
  Mic,
  ShieldCheck,
  Sparkles,
  Search,
  Wrench,
} from 'lucide-react'
import 'leaflet/dist/leaflet.css'

const API_BASE = import.meta.env.VITE_API_URL || '/api'
const categories = [
  'Garbage Collection',
  'Water Leakage',
  'Road Damage',
  'Drainage Problem',
  'Electricity Problem',
  'Streetlight Problem',
  'Public Sanitation',
  'Other',
]
const languages = ['Tamil', 'English', 'Tanglish']
const statusOptions = ['Pending', 'In Progress', 'Resolved']
const urgencyOptions = ['Low', 'Medium', 'High', 'Critical']
const stageDefinitions = [
  { key: 'recording', label: 'Recording audio', helper: 'Live microphone capture in progress' },
  { key: 'uploading', label: 'Sending audio to backend', helper: 'Uploading to the server securely' },
  { key: 'transcribing', label: 'Transcribing with Gnani', helper: 'Speech-to-text in progress' },
  { key: 'classifying', label: 'Classifying complaint', helper: 'Reviewing issue type and urgency' },
  { key: 'confirming', label: 'Waiting for user confirmation', helper: 'Review before ticket creation' },
  { key: 'creating', label: 'Creating complaint ticket', helper: 'Saving to the database' },
  { key: 'confirmation', label: 'Tamil confirmation', helper: 'Audio/text response ready' },
]

const statusTone = {
  Pending: 'bg-amber-100 text-amber-800 ring-amber-200',
  'In Progress': 'bg-sky-100 text-sky-800 ring-sky-200',
  Resolved: 'bg-emerald-100 text-emerald-800 ring-emerald-200',
}

const urgencyTone = {
  Low: 'bg-slate-100 text-slate-700',
  Medium: 'bg-yellow-100 text-yellow-800',
  High: 'bg-orange-100 text-orange-700',
  Critical: 'bg-red-100 text-red-700',
}

const statusColors = {
  Pending: '#F59E0B',
  'In Progress': '#3B82F6',
  Resolved: '#10B981',
}

const apiClient = axios.create({ baseURL: API_BASE })

const getAdminHeaders = () => {
  const token = localStorage.getItem('nammafix-admin-token')
  return token ? { Authorization: `Bearer ${token}` } : {}
}

const getUserHeaders = () => {
  const token = localStorage.getItem('nammafix-user-token')
  return token ? { Authorization: `Bearer ${token}` } : {}
}

const formatDate = (value) => {
  if (!value) return 'Not available'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

function App() {
  return (
    <BrowserRouter>
      <AppShell />
    </BrowserRouter>
  )
}

function AppShell() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/85 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <Link to="/" className="flex items-center gap-3 text-slate-900">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-700 text-lg font-bold text-white shadow-lg shadow-emerald-500/25">
              N
            </div>
            <div>
              <div className="text-lg font-bold">NammaFix AI</div>
              <div className="text-xs text-slate-500">AI civic operations platform</div>
            </div>
          </Link>

          <nav className="hidden items-center gap-6 text-sm font-medium md:flex">
            <NavLink to="/" className={({ isActive }) => `transition ${isActive ? 'text-emerald-700' : 'text-slate-600 hover:text-slate-900'}`}>
              Home
            </NavLink>
            <NavLink to="/report" className={({ isActive }) => `transition ${isActive ? 'text-emerald-700' : 'text-slate-600 hover:text-slate-900'}`}>
              Report Issue
            </NavLink>
            <NavLink to="/dashboard" className={({ isActive }) => `transition ${isActive ? 'text-emerald-700' : 'text-slate-600 hover:text-slate-900'}`}>
              Dashboard
            </NavLink>
            <NavLink to="/tracking" className={({ isActive }) => `transition ${isActive ? 'text-emerald-700' : 'text-slate-600 hover:text-slate-900'}`}>
              Tracking
            </NavLink>
            <NavLink to="/admin" className={({ isActive }) => `transition ${isActive ? 'text-emerald-700' : 'text-slate-600 hover:text-slate-900'}`}>
              Admin
            </NavLink>
          </nav>

          <div className="flex items-center gap-2">
            <Link to="/login" className="hidden rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-900 sm:inline-flex">
              Login
            </Link>
            <Link to="/signup" className="hidden rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-900 sm:inline-flex">
              Sign up
            </Link>
            <Link to="/report" className="inline-flex items-center gap-2 rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-emerald-600/20 transition hover:bg-emerald-700">
              <Mic className="h-4 w-4" />
              Report Issue
            </Link>
          </div>
        </div>
      </header>

      <main>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<AuthPage mode="login" />} />
          <Route path="/signup" element={<AuthPage mode="signup" />} />
          <Route path="/report" element={<ReportIssuePage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/tracking" element={<TrackingPage />} />
          <Route path="/complaints/:id" element={<ComplaintDetailsPage />} />
          <Route path="/admin" element={<AdminPage />} />
        </Routes>
      </main>

      <footer className="border-t border-slate-200 bg-slate-100/80">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-10 text-sm text-slate-600 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div>
            <div className="font-semibold text-slate-800">NammaFix AI</div>
            <div>Prototype civic issue reporting and tracking dashboard.</div>
          </div>
          <div className="flex items-center gap-2 text-slate-500">
            <ShieldCheck className="h-4 w-4" />
            Demo-only workflow. Not an official government complaint submission system.
          </div>
        </div>
      </footer>
    </div>
  )
}

function HomePage() {
  return (
    <div>
      <section className="relative overflow-hidden bg-white">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.12),_transparent_45%)]" />
        <div className="relative mx-auto grid max-w-7xl gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:px-8 lg:py-24">
          <div className="flex flex-col justify-center">
            <div className="mb-6 inline-flex w-fit items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-700">
              <Sparkles className="h-4 w-4" />
              Voice-powered civic issue tracking
            </div>
            <h1 className="max-w-xl text-4xl font-black tracking-tight text-slate-900 sm:text-5xl">
              Speak Up. Make Your City Better.
            </h1>
            <p className="mt-6 max-w-lg text-lg text-slate-600">
              உங்கள் பகுதி பிரச்சனைகளை குரல் மூலம் தெரிவிக்கவும்
            </p>
            <div className="mt-8 flex flex-wrap gap-4">
              <Link to="/report" className="inline-flex items-center gap-2 rounded-full bg-emerald-600 px-6 py-3 text-base font-semibold text-white shadow-lg shadow-emerald-600/20 transition hover:bg-emerald-700">
                Report an Issue
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link to="/dashboard" className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-6 py-3 text-base font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900">
                View Dashboard
              </Link>
            </div>
            <div className="mt-10 flex flex-wrap gap-6 text-sm text-slate-600">
              <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-600" /> Tamil, English, Tanglish</div>
              <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-600" /> Transparent issue classification</div>
              <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-600" /> Real-time civic operations view</div>
            </div>
          </div>

          <div className="relative">
            <div className="rounded-[30px] border border-slate-200 bg-slate-900 p-4 shadow-2xl shadow-slate-200">
              <div className="rounded-[24px] bg-white p-5">
                <div className="flex items-center justify-between border-b border-slate-200 pb-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Live civic feed</p>
                    <h2 className="mt-1 text-xl font-bold text-slate-900">City Ops Overview</h2>
                  </div>
                  <div className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">AI demo</div>
                </div>
                <div className="mt-6 space-y-4">
                  {[
                    ['Garbage Collection', 'Anna Nagar', 'High'],
                    ['Water Leakage', 'T Nagar', 'Critical'],
                    ['Road Damage', 'Velachery', 'High'],
                  ].map(([category, area, urgency]) => (
                    <div key={category} className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <div>
                        <div className="font-semibold text-slate-900">{category}</div>
                        <div className="mt-1 flex items-center gap-2 text-sm text-slate-500">
                          <MapPin className="h-3.5 w-3.5" />
                          {area}
                        </div>
                      </div>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${urgencyTone[urgency] || 'bg-slate-100 text-slate-700'}`}>
                        {urgency}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <div className="mb-10 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-600">How it works</p>
            <h2 className="mt-2 text-3xl font-bold text-slate-900">From voice to civic action</h2>
          </div>
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          {[
            { icon: Mic, title: 'Capture voice', text: 'Record a complaint in Tamil, English or Tanglish using the browser recorder.' },
            { icon: FileText, title: 'Review transcript', text: 'Correct the auto-generated transcript or type a manual fallback in demo mode.' },
            { icon: BarChart3, title: 'Track and prioritize', text: 'Use transparent classification and status flow to route urgent issues faster.' },
          ].map(({ icon: Icon, title, text }) => (
            <div key={title} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
                <Icon className="h-5 w-5" />
              </div>
              <h3 className="text-xl font-semibold text-slate-900">{title}</h3>
              <p className="mt-3 text-slate-600">{text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-slate-900 py-20 text-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-8">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-300">Supported categories</p>
            <h2 className="mt-2 text-3xl font-bold">Public issue categories</h2>
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {categories.map((category) => (
              <div key={category} className="rounded-2xl border border-slate-700 bg-slate-800 p-4 text-slate-200">
                <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-300">
                  <Wrench className="h-4 w-4" />
                </div>
                <div className="font-semibold text-white">{category}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-center">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-600">Languages</p>
            <h2 className="mt-2 text-3xl font-bold text-slate-900">Built for local communities</h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              ['Tamil', 'எந்த பிரச்சனையும் குரலில் பதிவு செய்யலாம்'],
              ['English', 'Record issues in clear everyday English'],
              ['Tanglish', 'Mix Tamil and English naturally for faster reporting'],
            ].map(([lang, text]) => (
              <div key={lang} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm transition hover:shadow-lg">
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-sky-100 text-sky-700">
                  <Globe className="h-5 w-5" />
                </div>
                <div className="text-lg font-semibold text-slate-900">{lang}</div>
                <p className="mt-2 text-sm text-slate-600">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}

function AuthPage({ mode = 'login' }) {
  const navigate = useNavigate()
  const isSignup = mode === 'signup'
  const [form, setForm] = useState({ name: '', email: '', password: '', confirmPassword: '' })
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleChange = (event) => {
    const { name, value } = event.target
    setForm((current) => ({ ...current, [name]: value }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()

    if (isSignup && form.password !== form.confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setIsSubmitting(true)
    setError('')

    try {
      const endpoint = isSignup ? '/auth/signup' : '/auth/login'
      const payload = isSignup
        ? { name: form.name, email: form.email, password: form.password }
        : { email: form.email, password: form.password }

      const response = await apiClient.post(endpoint, payload)
      localStorage.setItem('nammafix-user-token', response.data.token)
      localStorage.setItem('nammafix-user', JSON.stringify(response.data.user))
      navigate('/')
    } catch (requestError) {
      const message = requestError?.response?.data?.message || 'Authentication failed. Please try again.'
      setError(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8">
      <div className="grid gap-8 overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-sm lg:grid-cols-[0.9fr_1.1fr]">
        <div className="bg-gradient-to-br from-emerald-600 via-emerald-700 to-slate-900 p-8 text-white lg:p-10">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-50">
            <ShieldCheck className="h-3.5 w-3.5" />
            Secure access
          </div>
          <h2 className="mt-8 text-3xl font-black tracking-tight">
            {isSignup ? 'Create your civic account' : 'Welcome back to NammaFix AI'}
          </h2>
          <p className="mt-4 max-w-md text-sm text-emerald-50/90">
            Track complaints, receive updates, and stay connected with your local civic operations dashboard.
          </p>

          <div className="mt-10 space-y-4 text-sm text-emerald-50/90">
            <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-3">
              <CheckCircle2 className="h-5 w-5 text-emerald-200" />
              Secure complaint tracking
            </div>
            <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-3">
              <CheckCircle2 className="h-5 w-5 text-emerald-200" />
              Tamil, English, and Tanglish support
            </div>
            <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-3">
              <CheckCircle2 className="h-5 w-5 text-emerald-200" />
              Real-time civic issue updates
            </div>
          </div>
        </div>

        <div className="p-6 sm:p-8 lg:p-10">
          <div className="mb-6 flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-600">Account</div>
              <h3 className="mt-2 text-3xl font-bold text-slate-900">{isSignup ? 'Sign up' : 'Login'}</h3>
            </div>
            <Link to={isSignup ? '/login' : '/signup'} className="text-sm font-semibold text-emerald-700 hover:text-emerald-800">
              {isSignup ? 'Already a member?' : 'Create account'}
            </Link>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {isSignup && (
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">Full name</label>
                <input name="name" value={form.name} onChange={handleChange} className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none focus:border-emerald-500" placeholder="Your full name" required />
              </div>
            )}

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Email address</label>
              <input type="email" name="email" value={form.email} onChange={handleChange} className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none focus:border-emerald-500" placeholder="name@example.com" required />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Password</label>
              <input type="password" name="password" value={form.password} onChange={handleChange} className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none focus:border-emerald-500" placeholder="Enter your password" required />
            </div>

            {isSignup && (
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">Confirm password</label>
                <input type="password" name="confirmPassword" value={form.confirmPassword} onChange={handleChange} className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none focus:border-emerald-500" placeholder="Re-enter your password" required />
              </div>
            )}

            {error && (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </div>
            )}

            <button type="submit" disabled={isSubmitting} className="inline-flex w-full items-center justify-center rounded-full bg-emerald-600 px-5 py-3 text-base font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300">
              {isSubmitting ? (isSignup ? 'Creating account...' : 'Logging in...') : (isSignup ? 'Create account' : 'Login')}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

function ReportIssuePage() {
  const navigate = useNavigate()
  const mediaRecorderRef = useRef(null)
  const streamRef = useRef(null)
  const chunksRef = useRef([])

  const [language, setLanguage] = useState('Tamil')
  const [transcript, setTranscript] = useState('')
  const [category, setCategory] = useState('Garbage Collection')
  const [location, setLocation] = useState('')
  const [description, setDescription] = useState('')
  const [audioUrl, setAudioUrl] = useState('')
  const [recordingSeconds, setRecordingSeconds] = useState(0)
  const [isRecording, setIsRecording] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [statusMessage, setStatusMessage] = useState('')
  const [demoMode, setDemoMode] = useState(false)
  const [processingStage, setProcessingStage] = useState('idle')
  const [classificationResult, setClassificationResult] = useState({ category: 'Garbage Collection', urgency: 'Medium', explanation: 'Pending analysis.' })
  const [submittedTicket, setSubmittedTicket] = useState(null)
  const [confirmationText, setConfirmationText] = useState('')
  const [audioData, setAudioData] = useState('')

  useEffect(() => {
    if (!isRecording) return undefined

    const timer = setInterval(() => {
      setRecordingSeconds((value) => value + 1)
    }, 1000)

    return () => clearInterval(timer)
  }, [isRecording])

  useEffect(() => {
    if (!transcript.trim()) return

    const runClassification = async () => {
      try {
        setProcessingStage('classifying')
        setStatusMessage('Classifying the complaint using the rule-based civic classifier...')
        const result = await apiClient.post('/complaints/classify', { text: transcript })
        setClassificationResult({
          category: result.data.category || 'Other',
          urgency: result.data.urgency || 'Medium',
          explanation: result.data.explanation || 'No additional explanation provided.',
        })
        setCategory(result.data.category || 'Other')
        if (result.data.category) {
          setStatusMessage(`Issue detected: ${result.data.category}. Review and confirm before submitting.`)
        }
      } catch (error) {
        setStatusMessage('Classification is unavailable right now. You can still continue with manual review.')
      } finally {
        setProcessingStage('confirming')
      }
    }

    runClassification()
  }, [transcript])

  useEffect(() => () => {
    if (audioUrl) URL.revokeObjectURL(audioUrl)
  }, [audioUrl])

  const startRecording = async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setStatusMessage('This browser does not support audio recording. Use the manual transcript field instead.')
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const mediaRecorder = new MediaRecorder(stream)
      chunksRef.current = []
      mediaRecorderRef.current = mediaRecorder

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data)
        }
      }

      mediaRecorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        const localUrl = URL.createObjectURL(blob)
        setAudioUrl(localUrl)
        stream.getTracks().forEach((track) => track.stop())

        if (blob.size > 0) {
          setProcessingStage('uploading')
          setStatusMessage('Sending audio to backend for transcription...')
          const formData = new FormData()
          formData.append('audio', blob, 'voice-recording.webm')

          try {
            const response = await apiClient.post('/complaints/transcribe', formData, {
              headers: { 'Content-Type': 'multipart/form-data' },
            })
            const nextTranscript = response.data.transcript || ''
            setTranscript(nextTranscript)
            setDemoMode(Boolean(response.data.mode === 'demo'))
            setStatusMessage(response.data.message || 'Audio processed successfully.')
            if (nextTranscript) setProcessingStage('transcribing')
          } catch (error) {
            const message = error?.response?.data?.message || 'Unable to transcribe the audio right now.'
            setStatusMessage(message)
          }
        }
      }

      mediaRecorder.start()
      setRecordingSeconds(0)
      setIsRecording(true)
      setProcessingStage('recording')
      setStatusMessage('Recording audio from the microphone...')
    } catch (error) {
      setStatusMessage('Microphone permission was denied. Please allow access to record audio.')
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
    }
  }

  const handleSubmit = async (event) => {
    event.preventDefault()

    if (!transcript.trim()) {
      setStatusMessage('Add a complaint description or record audio before submitting.')
      return
    }

    try {
      setIsSubmitting(true)
      setProcessingStage('creating')
      setStatusMessage('Creating complaint ticket in the civic operations database...')

      const response = await apiClient.post('/complaints', {
        complaintText: transcript,
        category,
        location: location || 'Chennai, Tamil Nadu',
        language,
        description,
        source: 'voice',
        urgency: classificationResult.urgency,
        classificationReason: classificationResult.explanation,
      })

      setSubmittedTicket(response.data)
      setProcessingStage('confirmation')
      setStatusMessage('Complaint ticket created successfully.')

      try {
        const confirmation = await apiClient.get(`/complaints/${response.data.ticketId}/confirmation`)
        setConfirmationText(confirmation.data.text || 'Complaint saved successfully.')
        setAudioData(confirmation.data.audioBase64 || '')
      } catch (confirmationError) {
        setConfirmationText('உங்கள் புகார் பதிவு செய்யப்பட்டுள்ளது. விரைவில் நடவடிக்கை எடுக்கப்படும்.')
      }

      navigate(`/complaints/${response.data.ticketId}`)
    } catch (error) {
      const message = error?.response?.data?.message || 'Unable to create the complaint ticket.'
      setStatusMessage(message)
      setProcessingStage('confirming')
    } finally {
      setIsSubmitting(false)
    }
  }

  const waveformBars = [40, 68, 52, 81, 60, 90, 72, 46, 58, 78, 62, 86]

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="mb-8 rounded-3xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
        <div className="flex items-center gap-2 font-medium">
          <AlertTriangle className="h-4 w-4" />
          Demo transcription mode is active when Gnani API credentials are unavailable. No fake API call is reported as successful.
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1.15fr_0.85fr]">
        <form onSubmit={handleSubmit} className="space-y-8 rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-600">Voice AI assistant</p>
              <h2 className="mt-2 text-3xl font-bold text-slate-900">Report a civic issue</h2>
            </div>
            <div className="rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
              {demoMode ? 'Demo transcription mode' : 'Live transcription mode'}
            </div>
          </div>

          <div className="rounded-[28px] border border-slate-200 bg-slate-50 p-5">
            <div className="flex flex-col items-center justify-center gap-4 text-center">
              <button
                type="button"
                onClick={isRecording ? stopRecording : startRecording}
                className={`group flex h-28 w-28 items-center justify-center rounded-full border-4 border-white shadow-lg transition ${isRecording ? 'bg-red-500 text-white shadow-red-200' : 'bg-emerald-500 text-white shadow-emerald-200 hover:bg-emerald-600'}`}
                aria-label={isRecording ? 'Stop recording' : 'Start recording'}
              >
                <Mic className="h-10 w-10" />
              </button>

              <div className="flex h-10 items-end gap-1">
                {waveformBars.map((height, index) => (
                  <span
                    key={`${height}-${index}`}
                    className={`w-1.5 rounded-full transition-all duration-300 ${isRecording ? 'bg-emerald-500' : 'bg-slate-300'}`}
                    style={{ height: `${height}px`, opacity: isRecording ? 1 : 0.55 }}
                  />
                ))}
              </div>

              <div className="text-sm text-slate-600">
                <div className="text-base font-semibold text-slate-900">{isRecording ? 'Recording in progress' : 'Ready to record'}</div>
                <div className="mt-1">{recordingSeconds}s elapsed</div>
              </div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Language</label>
              <select value={language} onChange={(event) => setLanguage(event.target.value)} className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none focus:border-emerald-500">
                {languages.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Detected urgency</label>
              <div className="flex h-[52px] items-center rounded-2xl border border-slate-300 bg-slate-50 px-4 py-3 text-slate-900">
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${urgencyTone[classificationResult.urgency] || 'bg-slate-100 text-slate-700'}`}>
                  {classificationResult.urgency || 'Medium'}
                </span>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2 text-sm font-medium text-slate-700">
              <label>Editable transcription</label>
              <span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-600">{transcript.length} chars</span>
            </div>
            <textarea value={transcript} onChange={(event) => setTranscript(event.target.value)} rows={6} className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none focus:border-emerald-500" placeholder="Your complaint transcript will appear here." />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Complaint category</label>
              <select value={category} onChange={(event) => setCategory(event.target.value)} className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none focus:border-emerald-500">
                {categories.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Location</label>
              <input value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Anna Nagar, Chennai" className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none focus:border-emerald-500" />
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-700">Additional notes</label>
            <textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={4} className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none focus:border-emerald-500" placeholder="Add any extra detail, landmark, or hazard context." />
          </div>

          {audioUrl && (
            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-700">Audio preview</label>
              <audio controls src={audioUrl} className="w-full" />
            </div>
          )}

          <div className="flex flex-wrap justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
            <div className="font-medium text-emerald-900">User confirmation required</div>
            <button type="submit" disabled={isSubmitting || !transcript.trim()} className="inline-flex items-center justify-center rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300">
              {isSubmitting ? 'Creating ticket...' : 'Confirm and submit'}
            </button>
          </div>
        </form>

        <aside className="space-y-6">
          <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h3 className="text-lg font-bold text-slate-900">AI analysis</h3>
              <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700">Rule-based</span>
            </div>

            <div className="space-y-4 text-sm text-slate-600">
              <InfoListRow label="Detected issue" value={classificationResult.category || category} />
              <InfoListRow label="Category" value={category} />
              <InfoListRow label="Urgency" value={<span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${urgencyTone[classificationResult.urgency] || 'bg-slate-100 text-slate-700'}`}>{classificationResult.urgency || 'Medium'}</span>} />
              <InfoListRow label="Location" value={location || 'Not extracted yet'} />
              <InfoListRow label="Transcript language" value={language} />
              <InfoListRow label="Reason" value={classificationResult.explanation || 'Awaiting classification'} />
            </div>
          </div>

          <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-lg font-bold text-slate-900">Processing stages</h3>
            <div className="mt-4 space-y-3">
              {stageDefinitions.map((stage) => {
                const active = processingStage === stage.key
                const done = stageDefinitions.findIndex((item) => item.key === processingStage) >= stageDefinitions.findIndex((item) => item.key === stage.key)
                return (
                  <div key={stage.key} className={`flex items-start gap-3 rounded-2xl border p-3 ${active ? 'border-emerald-200 bg-emerald-50' : done ? 'border-emerald-100 bg-emerald-25' : 'border-slate-200 bg-slate-50'}`}>
                    <div className={`mt-0.5 flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${done ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-600'}`}>
                      {done ? '✓' : stageDefinitions.findIndex((item) => item.key === stage.key) + 1}
                    </div>
                    <div className="flex-1">
                      <div className="font-medium text-slate-800">{stage.label}</div>
                      <div className="text-xs text-slate-500">{stage.helper}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="rounded-[28px] border border-slate-200 bg-slate-900 p-6 text-white shadow-sm">
            <div className="flex items-center gap-2 text-emerald-300"><ShieldCheck className="h-4 w-4" /> AI system status</div>
            <p className="mt-3 text-sm text-slate-300">{statusMessage || 'Ready for the next stage in the workflow.'}</p>
          </div>

          {submittedTicket && (
            <div className="rounded-[28px] border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-900">
              <div className="font-semibold">Ticket created</div>
              <div className="mt-2">#{submittedTicket.ticketId}</div>
              {confirmationText && <div className="mt-3">{confirmationText}</div>}
              {audioData && (
                <audio controls src={`data:audio/mpeg;base64,${audioData}`} className="mt-3 w-full" />
              )}
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}

function DashboardPage() {
  const [dashboard, setDashboard] = useState({
    total: 0,
    pending: 0,
    inProgress: 0,
    resolved: 0,
    highUrgency: 0,
    resolutionRate: 0,
    dailyTrend: [],
    categoryDistribution: [],
    areaStats: [],
    recentActivity: [],
    insightCards: [],
    repeatedByLocation: [],
    unresolvedAreas: [],
  })
  const [complaints, setComplaints] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('All')
  const [statusFilter, setStatusFilter] = useState('All')
  const [urgencyFilter, setUrgencyFilter] = useState('All')
  const [mapView, setMapView] = useState('map')

  const loadData = async () => {
    try {
      setLoading(true)
      const [complaintsResponse, dashboardResponse] = await Promise.all([
        apiClient.get('/complaints'),
        apiClient.get('/dashboard'),
      ])
      setComplaints(complaintsResponse.data)
      setDashboard(dashboardResponse.data)
    } catch (error) {
      console.error('Failed to load dashboard analytics', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const filteredComplaints = useMemo(() => {
    return complaints.filter((complaint) => {
      const matchesSearch = !search || (complaint.ticketId || '').toLowerCase().includes(search.toLowerCase()) || (complaint.location || '').toLowerCase().includes(search.toLowerCase())
      const matchesCategory = categoryFilter === 'All' || complaint.category === categoryFilter
      const matchesStatus = statusFilter === 'All' || complaint.status === statusFilter
      const matchesUrgency = urgencyFilter === 'All' || complaint.urgency === urgencyFilter
      return matchesSearch && matchesCategory && matchesStatus && matchesUrgency
    })
  }, [complaints, search, categoryFilter, statusFilter, urgencyFilter])

  const analyticsCards = [
    { label: 'Total complaints', value: dashboard.total, accent: 'bg-slate-900 text-white' },
    { label: 'Pending', value: dashboard.pending, accent: 'bg-amber-100 text-amber-800' },
    { label: 'In progress', value: dashboard.inProgress, accent: 'bg-sky-100 text-sky-800' },
    { label: 'Resolved', value: dashboard.resolved, accent: 'bg-emerald-100 text-emerald-800' },
    { label: 'High urgency', value: dashboard.highUrgency, accent: 'bg-red-100 text-red-700' },
    { label: 'Resolution rate', value: `${dashboard.resolutionRate}%`, accent: 'bg-violet-100 text-violet-700' },
  ]

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-600">Operations dashboard</p>
          <h2 className="mt-2 text-3xl font-bold text-slate-900">AI-powered civic intelligence</h2>
        </div>
        <button type="button" onClick={loadData} className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-slate-400">
          Refresh data
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {analyticsCards.map((card) => (
          <div key={card.label} className={`rounded-[24px] p-5 ${card.accent}`}>
            <div className="text-sm opacity-80">{card.label}</div>
            <div className="mt-3 text-3xl font-black">{card.value}</div>
          </div>
        ))}
      </div>

      <div className="mt-8 grid gap-6 xl:grid-cols-2">
        <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-2">
            <h3 className="text-lg font-bold text-slate-900">Daily complaint trend</h3>
            <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Real data</div>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={dashboard.dailyTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis dataKey="date" tickLine={false} axisLine={false} />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
                <Tooltip />
                <Line type="monotone" dataKey="count" stroke="#10B981" strokeWidth={3} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-2">
            <h3 className="text-lg font-bold text-slate-900">Category distribution</h3>
            <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Current mix</div>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={dashboard.categoryDistribution} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={4}>
                  {dashboard.categoryDistribution.map((entry, index) => (
                    <Cell key={`${entry.name}-${index}`} fill={['#10B981', '#3B82F6', '#F59E0B', '#F97316', '#A855F7', '#06B6D4'][index % 6]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="mt-8 grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-6 flex items-center justify-between gap-3">
            <h3 className="text-lg font-bold text-slate-900">Smart insights</h3>
            <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Transparent calculations</div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {dashboard.insightCards.map((card) => (
              <div key={card.label} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs uppercase tracking-[0.2em] text-slate-500">{card.label}</div>
                <div className="mt-2 text-xl font-bold text-slate-900">{card.value}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h3 className="text-lg font-bold text-slate-900">Area-wise issues</h3>
            <div className="text-xs uppercase tracking-[0.2em] text-slate-400">By area</div>
          </div>
          <div className="space-y-4">
            {dashboard.areaStats.map((area) => (
              <div key={area.name}>
                <div className="mb-1 flex items-center justify-between text-sm text-slate-700">
                  <span>{area.name}</span>
                  <span className="font-semibold">{area.count}</span>
                </div>
                <div className="h-2 rounded-full bg-slate-100">
                  <div className="h-2 rounded-full bg-emerald-500" style={{ width: `${(area.count / Math.max(dashboard.total || 1, 1)) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-8 rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-bold text-slate-900">Complaint map and list</h3>
          </div>
          <div className="flex gap-2 rounded-full bg-slate-100 p-1">
            <button type="button" onClick={() => setMapView('map')} className={`rounded-full px-3 py-1.5 text-sm font-medium ${mapView === 'map' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'}`}>Map</button>
            <button type="button" onClick={() => setMapView('list')} className={`rounded-full px-3 py-1.5 text-sm font-medium ${mapView === 'list' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'}`}>List</button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <div className="md:col-span-2">
            <div className="relative">
              <Search className="absolute left-3 top-3.5 h-4 w-4 text-slate-400" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search ticket ID or location" className="w-full rounded-2xl border border-slate-300 bg-white py-3 pl-10 pr-3 text-slate-900 outline-none focus:border-emerald-500" />
            </div>
          </div>
          <div>
            <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} className="w-full rounded-2xl border border-slate-300 bg-white px-3 py-3 text-slate-900 outline-none focus:border-emerald-500">
              <option value="All">All categories</option>
              {categories.map((category) => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
          </div>
          <div>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="w-full rounded-2xl border border-slate-300 bg-white px-3 py-3 text-slate-900 outline-none focus:border-emerald-500">
              <option value="All">All statuses</option>
              {statusOptions.map((status) => (
                <option key={status} value={status}>{status}</option>
              ))}
            </select>
          </div>
        </div>

        {mapView === 'map' ? (
          <div className="mt-6 h-[420px] w-full overflow-hidden rounded-[24px] border border-slate-200">
            <MapContainer center={[13.0827, 80.2707]} zoom={11} scrollWheelZoom className="h-full w-full">
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap contributors" />
              {filteredComplaints.map((complaint) => {
                const coordinates = Array.isArray(complaint.coordinates) && complaint.coordinates.length === 2 ? complaint.coordinates : [13.0827, 80.2707]
                return (
                  <CircleMarker key={complaint.ticketId} center={coordinates} radius={10} pathOptions={{ color: statusColors[complaint.status] || '#64748B', fillColor: statusColors[complaint.status] || '#64748B', fillOpacity: 0.9 }}>
                    <Popup>
                      <div className="text-sm">
                        <div className="font-bold text-slate-900">{complaint.ticketId}</div>
                        <div className="mt-1">{complaint.category}</div>
                        <div className="mt-1 text-slate-600">{complaint.status}</div>
                      </div>
                    </Popup>
                  </CircleMarker>
                )
              })}
            </MapContainer>
          </div>
        ) : (
          <div className="mt-6 overflow-hidden rounded-[24px] border border-slate-200">
            {filteredComplaints.length === 0 ? (
              <div className="flex min-h-40 items-center justify-center text-slate-500">No complaints available for the current filters.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm text-slate-700">
                  <thead className="bg-slate-50 text-xs uppercase tracking-[0.16em] text-slate-500">
                    <tr>
                      <th className="px-4 py-4">Ticket</th>
                      <th className="px-4 py-4">Category</th>
                      <th className="px-4 py-4">Location</th>
                      <th className="px-4 py-4">Status</th>
                      <th className="px-4 py-4">View</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredComplaints.map((complaint) => (
                      <tr key={complaint.ticketId} className="border-t border-slate-200">
                        <td className="px-4 py-4 font-semibold text-slate-900">{complaint.ticketId}</td>
                        <td className="px-4 py-4">{complaint.category}</td>
                        <td className="px-4 py-4">{complaint.location}</td>
                        <td className="px-4 py-4">
                          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${statusTone[complaint.status] || 'bg-slate-100 text-slate-700 ring-slate-200'}`}>{complaint.status}</span>
                        </td>
                        <td className="px-4 py-4">
                          <Link to={`/complaints/${complaint.ticketId}`} className="inline-flex items-center gap-1 font-semibold text-emerald-700 hover:text-emerald-800">
                            Open <ChevronRight className="h-4 w-4" />
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function ComplaintDetailsPage() {
  const { id } = useParams()
  const [complaint, setComplaint] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchComplaint = async () => {
      setLoading(true)
      try {
        const response = await apiClient.get(`/complaints/${id}`)
        setComplaint(response.data)
      } catch (error) {
        setComplaint(null)
      } finally {
        setLoading(false)
      }
    }

    if (id) fetchComplaint()
  }, [id])

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-20 sm:px-6">
        <div className="rounded-[28px] border border-slate-200 bg-white p-8 text-center text-slate-600 shadow-sm">
          Loading complaint details...
        </div>
      </div>
    )
  }

  if (!complaint) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-20 sm:px-6">
        <div className="rounded-[28px] border border-dashed border-slate-300 bg-slate-50 p-10 text-center text-slate-500 shadow-sm">
          Complaint not found or no ticket data is available.
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-600">Complaint record</div>
          <h2 className="mt-2 text-3xl font-bold text-slate-900">{complaint.ticketId}</h2>
        </div>
        <Link to="/tracking" className="inline-flex items-center rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:text-slate-900">
          Back to tracking
        </Link>
      </div>

      <div className="space-y-8">
        <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="text-sm uppercase tracking-[0.2em] text-slate-500">Status</div>
              <div className="mt-2 text-2xl font-bold text-slate-900">{complaint.status}</div>
            </div>
            <span className={`rounded-full px-3 py-1 text-sm font-semibold ring-1 ${statusTone[complaint.status] || 'bg-slate-100 text-slate-700 ring-slate-200'}`}>
              {complaint.status}
            </span>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <InfoItem label="Category" value={complaint.category} />
            <InfoItem label="Urgency" value={<span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${urgencyTone[complaint.urgency] || 'bg-slate-100 text-slate-700'}`}>{complaint.urgency}</span>} />
            <InfoItem label="Location" value={complaint.location} />
            <InfoItem label="Submitted" value={formatDate(complaint.submittedAt)} />
          </div>
        </div>

        <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-2 text-lg font-bold text-slate-900">
            <FileText className="h-5 w-5 text-emerald-600" />
            Complaint description
          </div>
          <p className="rounded-2xl bg-slate-50 p-4 text-slate-700">{complaint.complaintText}</p>
        </div>

        <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-2 text-lg font-bold text-slate-900">
            <Clock3 className="h-5 w-5 text-emerald-600" />
            Status timeline
          </div>
          <div className="space-y-4">
            {(complaint.timeline || []).map((entry, index) => (
              <div key={`${entry.status}-${index}`} className="flex gap-4 rounded-2xl bg-slate-50 p-4">
                <div className="flex flex-col items-center">
                  <div className="mt-1 h-3 w-3 rounded-full bg-emerald-500" />
                  {index < (complaint.timeline || []).length - 1 && <div className="mt-2 h-full w-px bg-slate-200" />}
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${statusTone[entry.status] || 'bg-slate-100 text-slate-700 ring-slate-200'}`}>{entry.status}</span>
                    <span className="text-xs text-slate-500">{formatDate(entry.timestamp)}</span>
                  </div>
                  <p className="mt-2 text-sm text-slate-600">{entry.note}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {complaint.adminRemarks && (
          <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-2 text-lg font-bold text-slate-900">Admin remarks</div>
            <p className="rounded-2xl bg-slate-50 p-4 text-slate-700">{complaint.adminRemarks}</p>
          </div>
        )}
      </div>
    </div>
  )
}

function TrackingPage() {
  const [ticketId, setTicketId] = useState('')
  const [complaint, setComplaint] = useState(null)
  const [loading, setLoading] = useState(false)

  const lookupTicket = async () => {
    if (!ticketId.trim()) return
    setLoading(true)
    try {
      const response = await apiClient.get(`/complaints/${ticketId.trim()}`)
      setComplaint(response.data)
    } catch (error) {
      setComplaint(null)
      console.error('Ticket lookup failed', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-3xl font-bold text-slate-900">Complaint tracking</h2>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <input value={ticketId} onChange={(event) => setTicketId(event.target.value)} placeholder="Search by ticket ID" className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none focus:border-emerald-500" />
          <button type="button" onClick={lookupTicket} className="rounded-full bg-emerald-600 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-700">
            {loading ? 'Searching...' : 'Track complaint'}
          </button>
        </div>
      </div>

      {!complaint ? (
        <div className="mt-8 rounded-[28px] border border-dashed border-slate-300 bg-slate-50 p-10 text-center text-slate-500">
          Enter a ticket ID to view complaint progress and timeline.
        </div>
      ) : (
        <div className="mt-8 space-y-8">
          <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm uppercase tracking-[0.2em] text-slate-500">Ticket</div>
                <div className="mt-2 text-2xl font-bold text-slate-900">{complaint.ticketId}</div>
              </div>
              <span className={`rounded-full px-3 py-1 text-sm font-semibold ring-1 ${statusTone[complaint.status] || 'bg-slate-100 text-slate-700 ring-slate-200'}`}>{complaint.status}</span>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <InfoItem label="Category" value={complaint.category} />
              <InfoItem label="Location" value={complaint.location} />
              <InfoItem label="Urgency" value={<span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${urgencyTone[complaint.urgency] || 'bg-slate-100 text-slate-700'}`}>{complaint.urgency}</span>} />
              <InfoItem label="Submitted" value={formatDate(complaint.submittedAt)} />
            </div>
          </div>

          <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center gap-2 text-lg font-bold text-slate-900"><FileText className="h-5 w-5 text-emerald-600" /> Complaint description</div>
            <p className="rounded-2xl bg-slate-50 p-4 text-slate-700">{complaint.complaintText}</p>
          </div>

          <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center gap-2 text-lg font-bold text-slate-900"><Clock3 className="h-5 w-5 text-emerald-600" /> Status timeline</div>
            <div className="space-y-4">
              {(complaint.timeline || []).map((entry, index) => (
                <div key={`${entry.status}-${index}`} className="flex gap-4 rounded-2xl bg-slate-50 p-4">
                  <div className="flex flex-col items-center">
                    <div className="mt-1 h-3 w-3 rounded-full bg-emerald-500" />
                    {index < (complaint.timeline || []).length - 1 && <div className="mt-2 h-full w-px bg-slate-200" />}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between gap-3">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${statusTone[entry.status] || 'bg-slate-100 text-slate-700 ring-slate-200'}`}>{entry.status}</span>
                      <span className="text-xs text-slate-500">{formatDate(entry.timestamp)}</span>
                    </div>
                    <p className="mt-2 text-sm text-slate-600">{entry.note}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {complaint.adminRemarks && (
            <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-2 text-lg font-bold text-slate-900">Admin remarks</div>
              <p className="rounded-2xl bg-slate-50 p-4 text-slate-700">{complaint.adminRemarks}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function AdminPage() {
  const [token, setToken] = useState(localStorage.getItem('nammafix-admin-token') || '')
  const [username, setUsername] = useState('admin')
  const [password, setPassword] = useState('admin123')
  const [complaints, setComplaints] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const login = async () => {
    try {
      const response = await apiClient.post('/admin/login', { username, password })
      localStorage.setItem('nammafix-admin-token', response.data.token)
      setToken(response.data.token)
      setError('')
      fetchComplaints()
    } catch (authError) {
      setError('Admin authentication failed. Check credentials.')
    }
  }

  const fetchComplaints = async () => {
    try {
      setLoading(true)
      const response = await apiClient.get('/admin/complaints', { headers: getAdminHeaders() })
      setComplaints(response.data)
    } catch (loadError) {
      setError('Session expired or admin access required.')
    } finally {
      setLoading(false)
    }
  }

  const updateComplaint = async (ticketId, updates) => {
    try {
      await apiClient.patch(`/complaints/${ticketId}`, updates, { headers: getAdminHeaders() })
      fetchComplaints()
    } catch (updateError) {
      setError('Unable to update complaint details.')
    }
  }

  useEffect(() => {
    if (token) fetchComplaints()
  }, [token])

  if (!token) {
    return (
      <div className="mx-auto max-w-lg px-4 py-20 sm:px-6">
        <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-6 text-center">
            <div className="mb-2 inline-flex items-center justify-center rounded-full bg-emerald-100 p-3 text-emerald-700"><ShieldCheck className="h-5 w-5" /></div>
            <h2 className="text-2xl font-bold text-slate-900">Admin sign in</h2>
          </div>
          <div className="space-y-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Username</label>
              <input value={username} onChange={(event) => setUsername(event.target.value)} className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none focus:border-emerald-500" />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Password</label>
              <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none focus:border-emerald-500" />
            </div>
            {error && <div className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
            <button type="button" onClick={login} className="inline-flex w-full items-center justify-center rounded-full bg-emerald-600 px-5 py-3 text-base font-semibold text-white hover:bg-emerald-700">
              Sign in
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="mb-8 flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-600">Admin panel</p>
          <h2 className="mt-2 text-3xl font-bold text-slate-900">Complaint management</h2>
        </div>
        <button type="button" onClick={() => { localStorage.removeItem('nammafix-admin-token'); setToken(''); }} className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-slate-400">
          Sign out
        </button>
      </div>

      {error && <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <div className="flex min-h-52 items-center justify-center text-slate-500">Loading complaints...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm text-slate-700">
              <thead className="bg-slate-50 text-xs uppercase tracking-[0.16em] text-slate-500">
                <tr>
                  <th className="px-4 py-4">Ticket</th>
                  <th className="px-4 py-4">Category</th>
                  <th className="px-4 py-4">Location</th>
                  <th className="px-4 py-4">Urgency</th>
                  <th className="px-4 py-4">Status</th>
                  <th className="px-4 py-4">Action</th>
                </tr>
              </thead>
              <tbody>
                {complaints.map((complaint) => (
                  <tr key={complaint.ticketId} className="border-t border-slate-200 align-top">
                    <td className="px-4 py-4 font-semibold text-slate-900">{complaint.ticketId}</td>
                    <td className="px-4 py-4">{complaint.category}</td>
                    <td className="px-4 py-4">{complaint.location}</td>
                    <td className="px-4 py-4">
                      <select value={complaint.urgency || 'Medium'} onChange={(event) => updateComplaint(complaint.ticketId, { urgency: event.target.value })} className="rounded-xl border border-slate-300 bg-white px-2 py-2 text-sm text-slate-900 outline-none focus:border-emerald-500">
                        {urgencyOptions.map((option) => (
                          <option key={option} value={option}>{option}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-4">
                      <select value={complaint.status || 'Pending'} onChange={(event) => updateComplaint(complaint.ticketId, { status: event.target.value })} className="rounded-xl border border-slate-300 bg-white px-2 py-2 text-sm text-slate-900 outline-none focus:border-emerald-500">
                        {statusOptions.map((option) => (
                          <option key={option} value={option}>{option}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-4">
                      <Link to={`/complaints/${complaint.ticketId}`} className="inline-flex items-center gap-1 font-semibold text-emerald-700 hover:text-emerald-800">
                        Details <ChevronRight className="h-4 w-4" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function InfoListRow({ label, value }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-3">
      <div className="text-xs uppercase tracking-[0.2em] text-slate-500">{label}</div>
      <div className="mt-2 font-medium text-slate-900">{value}</div>
    </div>
  )
}

function InfoItem({ label, value }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-4">
      <div className="text-xs uppercase tracking-[0.2em] text-slate-500">{label}</div>
      <div className="mt-2 font-semibold text-slate-900">{value}</div>
    </div>
  )
}

export default App
