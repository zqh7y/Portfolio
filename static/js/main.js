/* =========================================================
   main.js — interactions & motion
   loader · custom cursor · smooth scroll · GSAP reveals ·
   magnetic buttons · tilt cards · counters · live repos
   ========================================================= */
(function () {
  "use strict";
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const hasGSAP = typeof window.gsap !== "undefined";
  if (hasGSAP && window.ScrollTrigger) gsap.registerPlugin(ScrollTrigger);

  /* ---------------- live clock ---------------- */
  const clock = document.getElementById("clock");
  function tickClock() {
    if (!clock) return;
    const d = new Date();
    const p = (n) => String(n).padStart(2, "0");
    clock.textContent = `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  }
  tickClock();
  setInterval(tickClock, 1000);

  /* ---------------- preloader ---------------- */
  const loader = document.getElementById("loader");
  const loaderNum = document.getElementById("loaderNum");
  const loaderBar = document.getElementById("loaderBar");

  function finishLoad() {
    document.body.classList.remove("is-loading");
    if (loader) loader.classList.add("done");
    startIntro();
  }

  function runLoader() {
    if (reduce || !loader) {
      document.body.classList.remove("is-loading");
      if (loader) loader.classList.add("done");
      startIntro();
      return;
    }
    let p = 0;
    const iv = setInterval(() => {
      p += Math.random() * 14 + 4;
      if (p >= 100) { p = 100; clearInterval(iv); setTimeout(finishLoad, 350); }
      if (loaderNum) loaderNum.textContent = Math.floor(p);
      if (loaderBar) loaderBar.style.width = p + "%";
    }, 120);
  }

  /* ---------------- smooth scroll (Lenis) ---------------- */
  let lenis = null;
  if (typeof window.Lenis !== "undefined" && !reduce) {
    lenis = new Lenis({ duration: 1.1, smoothWheel: true });
    function raf(time) { lenis.raf(time); requestAnimationFrame(raf); }
    requestAnimationFrame(raf);
    if (hasGSAP && window.ScrollTrigger) {
      lenis.on("scroll", ScrollTrigger.update);
    }
  }
  // anchor links -> smooth scroll
  document.querySelectorAll('a[href^="#"]').forEach((a) => {
    a.addEventListener("click", (e) => {
      const id = a.getAttribute("href");
      if (id === "#" || id.length < 2) return;
      const el = document.querySelector(id);
      if (!el) return;
      e.preventDefault();
      if (lenis) lenis.scrollTo(el, { offset: 0, duration: 1.3 });
      else el.scrollIntoView({ behavior: "smooth" });
    });
  });

  /* ---------------- custom cursor ---------------- */
  const cursor = document.getElementById("cursor");
  const cursorDot = document.getElementById("cursorDot");
  const cursorLabel = document.getElementById("cursorLabel");
  const pos = { x: innerWidth / 2, y: innerHeight / 2 };
  const dot = { x: pos.x, y: pos.y };

  if (cursor && !matchMedia("(hover: none)").matches) {
    window.addEventListener("pointermove", (e) => { pos.x = e.clientX; pos.y = e.clientY; });
    function renderCursor() {
      dot.x += (pos.x - dot.x) * 0.18;
      dot.y += (pos.y - dot.y) * 0.18;
      cursor.style.transform = `translate(${dot.x}px, ${dot.y}px) translate(-50%,-50%)`;
      if (cursorDot) cursorDot.style.transform = `translate(${pos.x}px, ${pos.y}px) translate(-50%,-50%)`;
      requestAnimationFrame(renderCursor);
    }
    renderCursor();

    document.querySelectorAll("[data-cursor], a, button, .magnetic").forEach((el) => {
      el.addEventListener("pointerenter", () => {
        cursor.classList.add("is-hover");
        if (cursorLabel) cursorLabel.textContent = el.getAttribute("data-cursor") || "";
      });
      el.addEventListener("pointerleave", () => {
        cursor.classList.remove("is-hover");
        if (cursorLabel) cursorLabel.textContent = "";
      });
    });
  }

  /* ---------------- magnetic buttons ---------------- */
  if (!reduce) {
    document.querySelectorAll(".magnetic").forEach((el) => {
      el.addEventListener("pointermove", (e) => {
        const r = el.getBoundingClientRect();
        const mx = e.clientX - r.left - r.width / 2;
        const my = e.clientY - r.top - r.height / 2;
        el.style.transform = `translate(${mx * 0.25}px, ${my * 0.35}px)`;
      });
      el.addEventListener("pointerleave", () => { el.style.transform = ""; });
    });
  }

  /* ---------------- tilt + glare cards ---------------- */
  if (!reduce) {
    document.querySelectorAll(".tilt").forEach((el) => {
      el.addEventListener("pointermove", (e) => {
        const r = el.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width;
        const py = (e.clientY - r.top) / r.height;
        const rx = (py - 0.5) * -8;
        const ry = (px - 0.5) * 10;
        el.style.transform = `perspective(900px) rotateX(${rx}deg) rotateY(${ry}deg) translateY(-4px)`;
        el.style.setProperty("--mx", px * 100 + "%");
        el.style.setProperty("--my", py * 100 + "%");
      });
      el.addEventListener("pointerleave", () => { el.style.transform = ""; });
    });
  }

  /* ---------------- intro + scroll animations ---------------- */
  function startIntro() {
    if (!hasGSAP) {
      document.querySelectorAll(".reveal-up").forEach((n) => { n.style.opacity = 1; n.style.transform = "none"; });
      return;
    }

    // split hero title into chars
    document.querySelectorAll("[data-split]").forEach((node) => {
      const text = node.textContent;
      node.textContent = "";
      text.split("").forEach((ch) => {
        const span = document.createElement("span");
        span.textContent = ch === " " ? " " : ch;
        span.style.display = "inline-block";
        span.style.willChange = "transform";
        span.className = "char";
        node.appendChild(span);
      });
    });

    const heroChars = document.querySelectorAll("#hero .char");
    const tl = gsap.timeline({ defaults: { ease: "expo.out" } });
    tl.from(heroChars, { yPercent: 120, duration: 1.1, stagger: 0.04 })
      .from(".hero__meta", { opacity: 0, y: 10, duration: 0.8 }, "-=0.7")
      .to(".hero__sub .reveal-up", { opacity: 1, y: 0, duration: 0.9, stagger: 0.12 }, "-=0.7")
      .from(".hero__scroll", { opacity: 0, duration: 0.6 }, "-=0.4");

    if (!window.ScrollTrigger) return;

    // section titles char reveal
    gsap.utils.toArray(".section .split").forEach((node) => {
      const chars = node.querySelectorAll(".char");
      if (!chars.length) return;
      gsap.from(chars, {
        yPercent: 110, opacity: 0, duration: 0.9, ease: "expo.out", stagger: 0.03,
        scrollTrigger: { trigger: node, start: "top 85%" },
      });
    });

    // about text — word by word fill
    const aboutText = document.querySelector("[data-words]");
    if (aboutText) {
      const words = aboutText.textContent.trim().split(/\s+/);
      aboutText.textContent = "";
      words.forEach((w) => {
        const s = document.createElement("span");
        s.className = "word"; s.textContent = w + " ";
        aboutText.appendChild(s);
      });
      gsap.to(aboutText.querySelectorAll(".word"), {
        opacity: 1, stagger: 0.04, ease: "none",
        scrollTrigger: { trigger: aboutText, start: "top 80%", end: "bottom 60%", scrub: true },
      });
    }

    // stat counters
    gsap.utils.toArray("[data-count]").forEach((el) => {
      const target = +el.getAttribute("data-count");
      const obj = { v: 0 };
      ScrollTrigger.create({
        trigger: el, start: "top 88%", once: true,
        onEnter: () => gsap.to(obj, {
          v: target, duration: 1.6, ease: "expo.out",
          onUpdate: () => { el.textContent = Math.floor(obj.v); },
        }),
      });
    });

    // stat cards + project cards rise in
    gsap.utils.toArray(".stat").forEach((el, i) => {
      gsap.from(el, { y: 40, opacity: 0, duration: 0.8, ease: "expo.out", delay: i * 0.08,
        scrollTrigger: { trigger: ".stats", start: "top 85%" } });
    });
    gsap.utils.toArray(".card").forEach((el) => {
      gsap.from(el, { y: 60, opacity: 0, duration: 0.9, ease: "expo.out",
        scrollTrigger: { trigger: el, start: "top 90%" } });
    });
    gsap.utils.toArray(".stack__item").forEach((el, i) => {
      gsap.from(el, { x: -30, opacity: 0, duration: 0.6, ease: "expo.out", delay: i * 0.04,
        scrollTrigger: { trigger: ".stack__list", start: "top 85%" } });
    });

    // marquee scroll-speed reaction
    const track = document.getElementById("marquee");
    if (track) {
      gsap.to(track, { xPercent: -50, repeat: -1, duration: 20, ease: "none" });
    }
  }

  /* ---------------- copy email ---------------- */
  const copyBtn = document.getElementById("copyMail");
  const copyHint = document.getElementById("copyHint");
  if (copyBtn) {
    copyBtn.addEventListener("click", async () => {
      const mail = copyBtn.getAttribute("data-email");
      try {
        await navigator.clipboard.writeText(mail);
        if (copyHint) { copyHint.textContent = "copied ✓"; setTimeout(() => (copyHint.textContent = "click to copy"), 1800); }
      } catch (e) {
        window.location.href = "mailto:" + mail;
      }
    });
  }

  /* ---------------- live GitHub repos ---------------- */
  fetch("/api/repos")
    .then((r) => r.json())
    .then((data) => {
      const box = document.getElementById("liveRepos");
      const txt = document.getElementById("liveText");
      if (box && txt && data.repos) {
        const n = data.repos.length;
        txt.textContent = `${n} public repos synced ${data.source === "github" ? "live from github" : "from cache"}`;
        box.hidden = false;
      }
    })
    .catch(() => {});

  runLoader();
})();
