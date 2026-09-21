// ---------------------------------------------------------------------------
// PROJECTS DATA — shared between the homepage scroller
// (src/components/ScrollScramble.jsx) and each project's own page at
// /<slug> (src/app/[slug]/page.js).
//
// Asset layout (per project) under /public/assets/01_Image/<NN_Name>/:
//   - <NN_Name>/CoverDesktop_*.mp4       -> list-view cover (16:9)
//   - <NN_Name>/CoverMobile_*.mp4        -> list-view cover on mobile
//   - <NN_Name>/IP PAGE/                 -> detail-view content (gallery)
//   - <NN_Name>/IP PAGE/BG/*.png         -> detail-view background image
//
// format: "16:9" | "4:5" | "9:16"  — main cover is 16:9 across the board.
// Gallery items each carry their own probed aspect (via ffprobe) so mixed
// portrait / landscape sit side-by-side on the horizontal scroller.
//
// theme: "dark" | "light"  — brightness of the cover media, drives the
// overlay text color: `dark` cover -> white text, `light` cover -> black.
// ---------------------------------------------------------------------------
const R = "/assets/01_Image";

export const PROJECTS = [
  {
    slug: "prada-magazine",
    title: "Prada Magazine",
    format: "16:9",
    theme: "light",
    image: `${R}/01_Prada Magazine/IP PAGE/BG/PRADA.png`,
    imageBg: `${R}/01_Prada Magazine/IP PAGE/BG/PRADA.png`,
    video: `${R}/01_Prada Magazine/DesktopCoverPradaMag.mp4`,
    videoMobile: `${R}/01_Prada Magazine/MobileCoverPradaMag.mp4`,
    description: "",
    gallery: [
      { format: "4:5", video: `${R}/01_Prada Magazine/IP PAGE/Edit1PradaMag.mp4` },
      { format: "4:5", image: `${R}/01_Prada Magazine/IP PAGE/Prada_Magazine.png` },
      { format: "4:5", video: `${R}/01_Prada Magazine/IP PAGE/Gif1PradaMag.mp4` },
      { format: "4:5", video: `${R}/01_Prada Magazine/IP PAGE/Edit2PradaMag.mp4` },
      { format: "4:5", image: `${R}/01_Prada Magazine/IP PAGE/Prada_Magazine3.png` },
      { format: "4:5", video: `${R}/01_Prada Magazine/IP PAGE/Gif2PradaMag.mp4` },
      { format: "4:5", video: `${R}/01_Prada Magazine/IP PAGE/Gif3PradaMag.mp4` },
    ],
  },
  {
    slug: "franck-muller-vanguard",
    title: "Franck Muller Vanguard",
    format: "16:9",
    theme: "dark",
    image: `${R}/03_Franck Muller Vanguard/IP page/BG/FM V.png`,
    imageBg: `${R}/03_Franck Muller Vanguard/IP page/BG/FM V.png`,
    video: `${R}/03_Franck Muller Vanguard/CoverDesktop_FM_Vanguard.mp4`,
    videoMobile: `${R}/03_Franck Muller Vanguard/CoverMobile_Franck Muller_Vanguard.mp4`,
    description: "",
    gallery: [
      { format: "16:9", video: `${R}/03_Franck Muller Vanguard/IP page/Franck Muller_Vanguard_CGI Animation_16-9_1920x1080_Social_FINAL.mp4` },
      { format: "4:5", image: `${R}/03_Franck Muller Vanguard/IP page/Franck Muller_Vanguard APAC_SHOT004_1080x1350.jpg` },
      { format: "4:5", image: `${R}/03_Franck Muller Vanguard/IP page/Franck Muller_Vanguard APAC_SHOT006_1080x1350.jpg` },
      { format: "16:9", image: `${R}/03_Franck Muller Vanguard/IP page/GIF 1.gif` },
      { format: "4:5", image: `${R}/03_Franck Muller Vanguard/IP page/Franck Muller_Vanguard APAC_SHOT007_1080x1350.jpg` },
      { format: "4:5", image: `${R}/03_Franck Muller Vanguard/IP page/Franck Muller_Vanguard APAC-Blue_SHOT008_1080x1350.jpg` },
      { format: "16:9", image: `${R}/03_Franck Muller Vanguard/IP page/GIF 2.gif` },
      { format: "16:9", image: `${R}/03_Franck Muller Vanguard/IP page/GIF 3.gif` },
    ],
  },
  {
    slug: "pucci-eyewear",
    title: "Pucci Eyewear",
    format: "16:9",
    theme: "dark",
    image: `${R}/04_Pucci Eyewear/IP PAGE/BG/PUCCI EW.png`,
    imageBg: `${R}/04_Pucci Eyewear/IP PAGE/BG/PUCCI EW.png`,
    video: `${R}/04_Pucci Eyewear/CoverDestop_PucciMarcolin.mp4`,
    videoMobile: `${R}/04_Pucci Eyewear/CoverMobile_PUCCIEyewear.mp4`,
    description: "",
    gallery: [
      { format: "16:9", video: `${R}/04_Pucci Eyewear/IP PAGE/PucciEyewear-Marcolin-OPTIC-MP4-LOGO.mp4` },
      { format: "16:9", video: `${R}/04_Pucci Eyewear/IP PAGE/PucciEyewear-Marcolin-DUO-MOVH265-LOGO.mov` },
      { format: "16:9", image: `${R}/04_Pucci Eyewear/IP PAGE/Gif1.gif` },
      { format: "4:5", image: `${R}/04_Pucci Eyewear/IP PAGE/Pucci_SH2020_Screnshot.png` },
      { format: "16:9", image: `${R}/04_Pucci Eyewear/IP PAGE/Gif2.gif` },
      { format: "16:9", image: `${R}/04_Pucci Eyewear/IP PAGE/Gif3.gif` },
      { format: "16:9", image: `${R}/04_Pucci Eyewear/IP PAGE/Gif4.gif` },
      { format: "16:9", image: `${R}/04_Pucci Eyewear/IP PAGE/Gif5.gif` },
    ],
  },
  {
    slug: "pucci-printstory",
    title: "Pucci Printstory",
    format: "16:9",
    theme: "dark",
    image: `${R}/05_Pucci Printstory/IP PAGE/BG/PUCCI PRINT.png`,
    imageBg: `${R}/05_Pucci Printstory/IP PAGE/BG/PUCCI PRINT.png`,
    video: `${R}/05_Pucci Printstory/CoverDesktop_Marmo_Edit_V10_VF_1920x1080.mp4`,
    videoMobile: `${R}/05_Pucci Printstory/CoverMobile_PucciPrint.mp4`,
    description: "",
    gallery: [
      { format: "4:5", video: `${R}/05_Pucci Printstory/IP PAGE/Marmo_Edit_V10_VF_2000x1500.mp4` },
      { format: "9:16", video: `${R}/05_Pucci Printstory/IP PAGE/PUCCI_PrintStory_VIVARA_9_16.mp4` },
    ],
  },
  {
    slug: "jpg-crocs",
    title: "JPG Crocs",
    format: "16:9",
    theme: "light",
    image: `${R}/07_JPG Crocs/IP PAGE/BG/JPG.png`,
    imageBg: `${R}/07_JPG Crocs/IP PAGE/BG/JPG.png`,
    video: `${R}/07_JPG Crocs/CoverDesktop_JPG Crocs.mp4`,
    videoMobile: `${R}/07_JPG Crocs/CoverMobile_JPG_Crocks_916 .mp4`,
    description: "",
    gallery: [
      { format: "16:9", video: `${R}/07_JPG Crocs/IP PAGE/JPG_Crocks_169.mp4` },
      { format: "4:5", image: `${R}/07_JPG Crocs/IP PAGE/gif 1.gif` },
      { format: "4:5", image: `${R}/07_JPG Crocs/IP PAGE/gif 2.gif` },
      { format: "4:5", image: `${R}/07_JPG Crocs/IP PAGE/gif 3.gif` },
      { format: "4:5", image: `${R}/07_JPG Crocs/IP PAGE/image (1).png` },
    ],
  },
  {
    slug: "franck-muller-damas",
    title: "Franck Muller Damas",
    format: "16:9",
    theme: "dark",
    image: `${R}/08_Franck Muller Damas/IP PAGE/BG/FM D.png`,
    imageBg: `${R}/08_Franck Muller Damas/IP PAGE/BG/FM D.png`,
    video: `${R}/08_Franck Muller Damas/CoverDesktop_FMDamas.mp4`,
    videoMobile: `${R}/08_Franck Muller Damas/CoverMobile_FM_Damascus30sFinal_1080x1920.mp4`,
    description: "",
    gallery: [
      { format: "16:9", video: `${R}/08_Franck Muller Damas/IP PAGE/FM_Damascus30sFinal_1920x1080.mp4` },
      { format: "4:5", video: `${R}/08_Franck Muller Damas/IP PAGE/FM_4-5_GIF.mov` },
      { format: "4:5", video: `${R}/08_Franck Muller Damas/IP PAGE/FM_4-5_GIF2.mov` },
      { format: "16:9", video: `${R}/08_Franck Muller Damas/IP PAGE/FM_horizontal.mov` },
      { format: "4:5", video: `${R}/08_Franck Muller Damas/IP PAGE/FM_4-5_GIF3.mov` },
      { format: "16:9", image: `${R}/08_Franck Muller Damas/IP PAGE/GIF 1.gif` },
      { format: "4:5", video: `${R}/08_Franck Muller Damas/IP PAGE/FM_4-5_GIF4.mov` },
      { format: "16:9", image: `${R}/08_Franck Muller Damas/IP PAGE/GIF 4.gif` },
    ],
  },
  {
    slug: "pucci-garden",
    title: "Pucci Garden",
    format: "16:9",
    theme: "dark",
    image: `${R}/09_Pucci Garden/IP PAGE/BG/PUCCI G.png`,
    imageBg: `${R}/09_Pucci Garden/IP PAGE/BG/PUCCI G.png`,
    video: `${R}/09_Pucci Garden/CoverDesktop_PucciGarden.mp4`,
    videoMobile: `${R}/09_Pucci Garden/CoverMobile_PucciGarden.mp4`,
    description: "",
    gallery: [
      { format: "16:9", video: `${R}/09_Pucci Garden/IP PAGE/16.9_PucciGarden.mp4` },
      { format: "16:9", image: `${R}/09_Pucci Garden/IP PAGE/Cover-ezgif.com-video-to-gif-converter.gif` },
    ],
  },
  {
    slug: "mcm-festiv",
    title: "MCM Festiv",
    format: "16:9",
    theme: "dark",
    image: `${R}/10_MCM Festiv/IP PAGE/BG/MCM F.png`,
    imageBg: `${R}/10_MCM Festiv/IP PAGE/BG/MCM F.png`,
    // NOTE: desktop cover is .mov (H.264 in a QuickTime container). Chrome/Safari
    // play it; Firefox may not — transcode to .mp4 if that becomes an issue.
    video: `${R}/10_MCM Festiv/CoverDesktop_MCMFestiv.mov`,
    videoMobile: `${R}/10_MCM Festiv/CoverMobile_MCMFestiv.mp4`,
    description: "",
    gallery: [
      { format: "16:9", video: `${R}/10_MCM Festiv/IP PAGE/MCM VFX V4.mp4` },
      { format: "16:9", video: `${R}/10_MCM Festiv/IP PAGE/MCM VFX 3 V3.mp4` },
      { format: "16:9", image: `${R}/10_MCM Festiv/IP PAGE/GIF 1.gif` },
      { format: "16:9", image: `${R}/10_MCM Festiv/IP PAGE/GIF 3.gif` },
      { format: "16:9", video: `${R}/10_MCM Festiv/IP PAGE/MCM VFX WORKFLOW 1 V5.mp4` },
    ],
  },
  {
    slug: "olympic-game",
    title: "Olympic Game",
    format: "16:9",
    theme: "dark",
    image: null,
    imageBg: null,
    video: `${R}/12_Olympic Game/MASTER_16_9_JO_ALPES_VOFR.mp4`,
    videoMobile: null,
    description: "",
    gallery: [],
  },
  {
    slug: "franck-muller-triple-mystery",
    title: "Franck Muller Triple Mystery",
    format: "16:9",
    theme: "dark",
    image: `${R}/13_Franck Muller Triple Mystery/IP PAGE/BG/FM TP.png`,
    imageBg: `${R}/13_Franck Muller Triple Mystery/IP PAGE/BG/FM TP.png`,
    video: `${R}/13_Franck Muller Triple Mystery/CoverDesktop_TRIPLEMYSTERY-1920x1080-15s.mp4`,
    videoMobile: `${R}/13_Franck Muller Triple Mystery/CoverMobile_FMTripleMystery.mp4`,
    description: "",
    gallery: [
      { format: "16:9", video: `${R}/13_Franck Muller Triple Mystery/IP PAGE/FM-1920x1080-FULL(NO-LOGO).mov` },
    ],
  },
  {
    slug: "mcm-candy",
    title: "MCM Candy",
    format: "16:9",
    theme: "light",
    image: `${R}/99_MCM Candy/IP PAGE/MCM_SHOT1_FINAL_169_Still1.png`,
    imageBg: `${R}/99_MCM Candy/IP PAGE/MCM_SHOT1_FINAL_169_Still1.png`,
    video: `${R}/99_MCM Candy/CoverDesktop_MCMCandy.mp4`,
    videoMobile: `${R}/99_MCM Candy/CoverMobile_MCMCandy.mp4`,
    description: "",
    gallery: [
      { format: "16:9", video: `${R}/99_MCM Candy/IP PAGE/MCM_SHOT1_FINAL_169.mp4` },
      { format: "16:9", video: `${R}/99_MCM Candy/IP PAGE/MCM_SHOT2_FINAL_169.mp4` },
      { format: "16:9", image: `${R}/99_MCM Candy/IP PAGE/GIF1.gif` },
      { format: "16:9", image: `${R}/99_MCM Candy/IP PAGE/GIF2.gif` },
    ],
  },
];
