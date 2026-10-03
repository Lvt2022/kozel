export function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal panel" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="modal__close" onClick={onClose} aria-label="Zavřít pravidla">
          ✕
        </button>
        <h2>Pravidla hry Kozel</h2>

        <h3>Základní parametry</h3>
        <ul>
          <li>Hraje se ve 4, každý sám za sebe.</li>
          <li>Balíček: 32 karet (mariášky) ve 4 barvách — Červené, Zelené, Žaludy, Kule — hodnoty 7, 8, 9, 10, Spodek, Svršek, Král, Eso.</li>
          <li>
            Hierarchie karet v barvě: 7 &lt; 8 &lt; 9 &lt; 10 &lt; Spodek &lt; Svršek &lt; Král &lt; Eso.
          </li>
          <li>Speciální karta <strong>Kozel</strong> je Zelený svršek.</li>
          <li>Cílem je mít na konci hry co nejméně trestných bodů. Hra končí po dohrání kola, ve kterém někdo dosáhne nebo překročí 100 bodů.</li>
        </ul>

        <h3>Bodování</h3>
        <ul>
          <li>Každá Červená karta: 1 trestný bod (8 červených karet v balíčku = 8 bodů).</li>
          <li>Zelený svršek (Kozel): 12 trestných bodů.</li>
          <li>Ostatní karty: 0 bodů.</li>
          <li>Pokud hráč, který drží Kozla, ho na začátku kola <strong>nahlásí</strong>, všechny body v daném kole se počítají <strong>2×</strong> (Červená karta = 2 body, Kozel = 24 bodů).</li>
        </ul>

        <h3>Rozdávání a výnos</h3>
        <ul>
          <li>Hraje se po směru hodinových ručiček. V 1. kole rozdává náhodně určený hráč, dál vždy ten, kdo v minulém kole nasbíral nejvíc trestných bodů.</li>
          <li>Každý dostane 8 karet. První kartu do kola vynáší hráč po levici rozdávajícího.</li>
          <li>Hráč s Kozlem se před prvním výnosem rozhodne, zda ho nahlásí (2× body) nebo si ho nechá pro sebe (1× body).</li>
        </ul>

        <h3>Přiznávání barvy</h3>
        <ul>
          <li>Kdo vynese kartu, určuje barvu štychu. Ostatní musí přiznat barvu, pokud ji mají — libovolnou kartou té barvy, přebíjet není povinné.</li>
          <li>Pokud hráč danou barvu nemá, smí zahrát jakoukoli jinou kartu.</li>
          <li>
            <strong>Červenou barvu nelze vynést</strong>, dokud nebyla v daném kole alespoň jednou odhozena (zahrána kýmkoliv) do nějakého štychu. Výjimka: hráč, který už má v ruce jen Červené karty, je vynést smí.
          </li>
        </ul>

        <h3>Vyhodnocení štychu</h3>
        <ul>
          <li>Hra nemá trumfy — štych bere nejvyšší karta ve vynesené barvě, karta jiné barvy štych nikdy nebere.</li>
          <li>Vítěz štychu si karty sebere a vynáší do dalšího štychu.</li>
        </ul>

        <h3>Konec hry</h3>
        <ul>
          <li>Hra skončí po dohrání kola, ve kterém hráč dosáhne či překročí 100 bodů. Ten prohrává (při shodě prohrávají všichni se stejným skóre).</li>
          <li>Poražený hráč musí po skončení hry zamečet tolikrát, o kolik bodů překročil 100 (např. při 104 bodech 4×).</li>
        </ul>

        <h3>Obtížnost</h3>
        <ul>
          <li><strong>Lehká:</strong> u každého hráče vidíš průběžně nasbírané trestné body v aktuálním kole.</li>
          <li><strong>Těžká:</strong> body v kole jsou skryté až do jeho konce — musíš si je pamatovat sám.</li>
          <li>V obou obtížnostech je vždy vidět, kolik štychů už kdo v kole sebral (hromádka otočená rubem dolů), ale ne jejich obsah.</li>
        </ul>
      </div>
    </div>
  );
}
