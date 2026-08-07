import { Navigate, Route, Routes } from "react-router-dom";
import { lazy, Suspense } from "react";

import CatchAllRedirect from "./components/CatchAllRedirect";

import RequireAuth from "./components/RequireAuth";

import AppLayout from "./layouts/AppLayout";

import UstaLayout from "./layouts/UstaLayout";

import Dashboard from "./pages/Dashboard";

import LoginPage from "./pages/LoginPage";

import LoyihalarPage from "./pages/LoyihalarPage";

import SectionPage from "./pages/SectionPage";

import UstaPanelPage from "./pages/UstaPanelPage";

import UstaLoyihalarPage from "./pages/UstaLoyihalarPage";

import UstaXarajatlarPage from "./pages/UstaXarajatlarPage";

import UstaIshVaqtlariPage from "./pages/UstaIshVaqtlariPage";

import UstaRasmlarPage from "./pages/UstaRasmlarPage";

import XarajatlarPage from "./pages/XarajatlarPage";

import RasmlarPage from "./pages/RasmlarPage";

import TahlilPage from "./pages/TahlilPage";

import ViloyatIshKunlariPage from "./pages/ViloyatIshKunlariPage";

import IshVaqtalariPage from "./pages/IshVaqtalariPage";

import SozlamalarPage from "./pages/SozlamalarPage";

import UstalarPage from "./pages/UstalarPage";
import BrigadalarPage from "./pages/BrigadalarPage";
import UstaFaollikPage from "./pages/UstaFaollikPage";
import YorijnomaAdminPage from "./pages/YorijnomaAdminPage";
import HisobotAdminPage from "./pages/HisobotAdminPage";
import CommercialOffersPage from "./pages/CommercialOffersPage";
import ContactsPage from "./pages/ContactsPage";
import TaminotPage from "./pages/TaminotPage";
import JalbaAdminPage from "./pages/JalbaAdminPage";
import UstaJalbaPage from "./pages/UstaJalbaPage";
import AsistenlarPage from "./pages/AsistenlarPage";
import AsistenLayout from "./layouts/AsistenLayout";
import AsistenPanelPage from "./pages/AsistenPanelPage";
import AsistenIshVaqtiPage from "./pages/AsistenIshVaqtiPage";

import { SECTION_COPY } from "./navConfig";

const MonthlyReportsPage = lazy(() => import("./pages/MonthlyReportsPage"));

function PageFallback() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center text-sm text-slate-500">
      Yuklanmoqda…
    </div>
  );
}



export default function App() {

  return (

    <Routes>

      <Route path="/login" element={<LoginPage />} />



      <Route element={<RequireAuth role="admin" />}>

        <Route element={<AppLayout />}>

          <Route index element={<Dashboard />} />

          <Route path="ustalar" element={<UstalarPage />} />
          <Route path="asistenlar" element={<AsistenlarPage />} />
          <Route path="usta-faolligi" element={<UstaFaollikPage />} />
          <Route path="yorijnoma" element={<YorijnomaAdminPage />} />
          <Route path="hisobot" element={<HisobotAdminPage />} />
          <Route path="admin/commercial-offers" element={<CommercialOffersPage />} />
          <Route path="admin/supply" element={<TaminotPage />} />
          <Route path="admin/contacts" element={<ContactsPage />} />
          <Route path="commercial-offers" element={<CommercialOffersPage />} />
          <Route path="supply" element={<TaminotPage />} />
          <Route path="jalba" element={<JalbaAdminPage />} />

          <Route path="brigadalar" element={<BrigadalarPage />} />

          <Route path="loyihalar" element={<LoyihalarPage />} />

          <Route

            path="vazifalar"

            element={<SectionPage {...SECTION_COPY.vazifalar} />}

          />

          <Route path="xarajatlar" element={<XarajatlarPage />} />

          <Route path="rasmlar" element={<RasmlarPage />} />

          <Route

            path="sifat-nazorati"

            element={<SectionPage {...SECTION_COPY["sifat-nazorati"]} />}

          />

          <Route path="tahlil" element={<TahlilPage />} />

          <Route
            path="admin/monthly-reports"
            element={
              <Suspense fallback={<PageFallback />}>
                <MonthlyReportsPage />
              </Suspense>
            }
          />

          <Route path="viloyat-ish-kunlari" element={<ViloyatIshKunlariPage />} />

          <Route path="ish-vaqtlari" element={<IshVaqtalariPage />} />

          <Route

            path="monitoring"

            element={<SectionPage {...SECTION_COPY.monitoring} />}

          />

          <Route path="sozlamalar" element={<SozlamalarPage />} />

          <Route path="*" element={<Navigate to="/" replace />} />

        </Route>

      </Route>



      <Route element={<RequireAuth role="usta" />}>

        <Route path="/usta-panel" element={<UstaLayout />}>

          <Route index element={<UstaPanelPage />} />

          <Route path="jalba" element={<UstaJalbaPage />} />
          <Route path="loyihalar" element={<UstaLoyihalarPage />} />

          <Route path="xarajatlar" element={<UstaXarajatlarPage />} />

          <Route path="rasmlar" element={<UstaRasmlarPage />} />

          <Route path="ish-vaqti" element={<UstaIshVaqtlariPage />} />

        </Route>

      </Route>

      <Route element={<RequireAuth role="asisten" />}>
        <Route path="/asisten-panel" element={<AsistenLayout />}>
          <Route index element={<AsistenPanelPage />} />
          <Route path="loyihalar" element={<LoyihalarPage />} />
          <Route
            path="monthly-reports"
            element={
              <Suspense fallback={<PageFallback />}>
                <MonthlyReportsPage />
              </Suspense>
            }
          />
          <Route path="tijoriy-taklif" element={<CommercialOffersPage />} />
          <Route path="taminot" element={<TaminotPage />} />
          <Route path="ish-vaqti" element={<AsistenIshVaqtiPage />} />
          <Route path="rasmlar" element={<RasmlarPage />} />
        </Route>
      </Route>

      <Route path="*" element={<CatchAllRedirect />} />

    </Routes>

  );

}

