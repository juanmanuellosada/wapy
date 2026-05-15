import Header from "./components/Header";
import Hero from "./components/Hero";
import HowItWorks from "./components/HowItWorks";
import Features from "./components/Features";
import DemoBand from "./components/DemoBand";
import Pricing from "./components/Pricing";
import Footer from "./components/Footer";

export default function LandingPage() {
  return (
    <>
      <Header />
      <main>
        <Hero />
        <HowItWorks />
        <Features />
        <DemoBand />
        <Pricing />
      </main>
      <Footer />
    </>
  );
}
