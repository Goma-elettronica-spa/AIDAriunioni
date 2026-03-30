import { Link } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

/* ------------------------------------------------------------------ */
/*  Navbar                                                             */
/* ------------------------------------------------------------------ */
function Navbar() {
  const [open, setOpen] = useState(false);

  return (
    <nav className="sticky top-0 z-50 bg-background/95 backdrop-blur border-b border-border">
      <div className="max-w-[1200px] mx-auto flex items-center justify-between px-6 h-16">
        <Link to="/" className="flex items-center gap-2.5">
          <div className="h-8 w-8 flex items-center justify-center rounded-md bg-foreground text-background font-bold text-sm">R</div>
          <span className="text-lg font-semibold text-foreground tracking-tight">Riunioni in Cloud</span>
        </Link>

        {/* Desktop */}
        <Link to="/login" className="hidden sm:inline-flex">
          <Button variant="outline" size="sm">Accedi</Button>
        </Link>

        {/* Mobile toggle */}
        <button
          className="sm:hidden text-foreground"
          onClick={() => setOpen(!open)}
          aria-label="Menu"
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="sm:hidden border-t border-border px-6 py-4 bg-background">
          <Link to="/login" onClick={() => setOpen(false)}>
            <Button variant="outline" className="w-full">Accedi</Button>
          </Link>
        </div>
      )}
    </nav>
  );
}

/* ------------------------------------------------------------------ */
/*  Hero                                                               */
/* ------------------------------------------------------------------ */
function Hero() {
  return (
    <section className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-6">
      <div className="max-w-[720px] text-center space-y-8">
        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-foreground leading-[1.1] tracking-tight">
          Le riunioni della tua prima linea meritano di lasciare il segno.
        </h1>
        <p className="text-lg sm:text-xl text-muted-foreground leading-relaxed max-w-[600px] mx-auto">
          Ogni mese i tuoi dirigenti si riuniscono. Ma senza struttura, senza dati, senza follow-up, quelle ore si perdono. Riunioni in Cloud trasforma ogni incontro in decisioni tracciabili e impegni mantenuti.
        </p>
        <div className="flex flex-col items-center gap-3">
          <Link to="/login">
            <Button className="h-12 px-8 text-base bg-foreground text-background hover:bg-foreground/90">
              Inizia ora
            </Button>
          </Link>
          <span className="text-sm text-muted-foreground">Nessuna carta di credito richiesta</span>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Pain points                                                        */
/* ------------------------------------------------------------------ */
const painCards = [
  {
    title: "La riunione finisce. E poi?",
    body: "Decisioni prese a voce, impegni dimenticati il giorno dopo. Nessuno sa chi doveva fare cosa. Il mese dopo si ricomincia da zero.",
  },
  {
    title: "I numeri? Ognuno porta i suoi.",
    body: "Nessun formato comune, nessun confronto con il mese prima. I KPI vengono citati a memoria e nessuno chiede perché sono cambiati.",
  },
  {
    title: "Il report? Lo fa qualcuno... forse.",
    body: "Qualcuno dovrebbe scrivere il riassunto, preparare le slide per il board, mandare i follow-up. Di solito non succede.",
  },
];

function PainSection() {
  return (
    <section className="py-24 sm:py-32 px-6">
      <div className="max-w-[1200px] mx-auto space-y-16">
        <h2 className="text-3xl sm:text-4xl font-bold text-foreground text-center tracking-tight">
          Suona familiare?
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {painCards.map((c) => (
            <div
              key={c.title}
              className="rounded-lg border border-border bg-card p-6 space-y-3"
            >
              <h3 className="text-lg font-semibold text-foreground">{c.title}</h3>
              <p className="text-muted-foreground leading-relaxed">{c.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  How it works (timeline)                                            */
/* ------------------------------------------------------------------ */
const steps = [
  {
    num: "1",
    title: "Prima della riunione",
    body: "Ogni dirigente compila i propri KPI, segnala i 3 highlight del mese, registra gli impegni e carica le proprie slide. Il sistema confronta automaticamente i numeri con il mese precedente e chiede perché sono cambiati.",
  },
  {
    num: "2",
    title: "Durante la riunione",
    body: "Tutti arrivano preparati. Un brief di una pagina sintetizza chi ha completato la preparazione, quali KPI sono critici e quali impegni del mese scorso sono stati mantenuti.",
  },
  {
    num: "3",
    title: "Dopo la riunione",
    body: "Il sistema genera automaticamente il riassunto operativo, la presentazione per il board e suggerisce i task di follow-up assegnati a chi di competenza. Tutto tracciato in un kanban condiviso.",
  },
];

function HowSection() {
  return (
    <section className="py-24 sm:py-32 px-6 bg-muted/30">
      <div className="max-w-[1200px] mx-auto space-y-16">
        <h2 className="text-3xl sm:text-4xl font-bold text-foreground text-center tracking-tight max-w-[700px] mx-auto">
          Un sistema che lavora prima, durante e dopo la riunione
        </h2>

        <div className="relative max-w-[640px] mx-auto">
          {/* Connecting line */}
          <div className="absolute left-5 top-0 bottom-0 w-px bg-border hidden sm:block" />

          <div className="space-y-12">
            {steps.map((s) => (
              <div key={s.num} className="flex gap-6 relative">
                {/* Circle */}
                <div className="shrink-0 z-10 w-10 h-10 rounded-full border-2 border-foreground bg-background flex items-center justify-center text-sm font-bold text-foreground">
                  {s.num}
                </div>
                <div className="space-y-2 pt-1">
                  <h3 className="text-lg font-semibold text-foreground">{s.title}</h3>
                  <p className="text-muted-foreground leading-relaxed">{s.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Benefits grid                                                      */
/* ------------------------------------------------------------------ */
const benefits = [
  { title: "KPI con memoria", body: "Ogni numero ha uno storico. Ogni variazione ha una spiegazione." },
  { title: "Impegni che restano", body: "Quello che prometti a marzo, lo verifichi ad aprile. Automaticamente." },
  { title: "Task che non si perdono", body: "Un kanban condiviso con scadenze, responsabili e stati. Niente più follow-up a voce." },
  { title: "Documenti in un click", body: "Riassunto PDF, presentazione, report Word. Generati, non scritti a mano." },
  { title: "Preparazione guidata", body: "Una checklist chiara: cosa devi fare, entro quando, cosa ti manca." },
  { title: "Storico completo", body: "Ogni riunione archiviata con video, dati, documenti e decisioni. Per sempre." },
];

function BenefitsSection() {
  return (
    <section className="py-24 sm:py-32 px-6">
      <div className="max-w-[1200px] mx-auto space-y-16">
        <h2 className="text-3xl sm:text-4xl font-bold text-foreground text-center tracking-tight">
          Tutto in un unico posto
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {benefits.map((b) => (
            <div
              key={b.title}
              className="rounded-lg border border-border bg-card p-6 space-y-2 border-t-2 border-t-foreground"
            >
              <h3 className="text-base font-semibold text-foreground">{b.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{b.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Trust                                                              */
/* ------------------------------------------------------------------ */
function TrustSection() {
  return (
    <section className="py-24 sm:py-32 px-6">
      <div className="max-w-[700px] mx-auto text-center space-y-6">
        <h2 className="text-3xl sm:text-4xl font-bold text-foreground tracking-tight">
          Pensato per chi guida
        </h2>
        <p className="text-lg text-muted-foreground leading-relaxed">
          Riunioni in Cloud nasce dall'esigenza reale di una multinazionale che voleva rendere produttive le riunioni della prima linea. Non è un tool generico: è costruito per chi prende decisioni ogni mese e vuole che quelle decisioni lascino traccia.
        </p>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Final CTA                                                          */
/* ------------------------------------------------------------------ */
function FinalCta() {
  return (
    <section className="py-24 sm:py-32 px-6 bg-muted/40">
      <div className="max-w-[600px] mx-auto text-center space-y-6">
        <h2 className="text-3xl sm:text-4xl font-bold text-foreground tracking-tight">
          Pronto a trasformare le tue riunioni?
        </h2>
        <div className="flex flex-col items-center gap-3">
          <Link to="/login">
            <Button className="h-12 px-8 text-base bg-foreground text-background hover:bg-foreground/90">
              Inizia ora
            </Button>
          </Link>
          <span className="text-sm text-muted-foreground">Nessuna carta di credito richiesta</span>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Footer                                                             */
/* ------------------------------------------------------------------ */
function Footer() {
  return (
    <footer className="border-t border-border py-8 px-6">
      <div className="max-w-[1200px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
        <span>Riunioni in Cloud © {new Date().getFullYear()}</span>
        <Link to="/login" className="hover:text-foreground transition-colors">Accedi</Link>
      </div>
    </footer>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */
export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navbar />
      <Hero />
      <PainSection />
      <HowSection />
      <BenefitsSection />
      <TrustSection />
      <FinalCta />
      <Footer />
    </div>
  );
}
