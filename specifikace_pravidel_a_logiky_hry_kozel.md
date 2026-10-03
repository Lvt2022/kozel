# Specifikace Vývoje Webové Hry "Kozel" (Game Logic & Rules Specification)

Tento dokument slouží jako kompletní technická a logická specifikace pro vývoj webové aplikace karetí hry **Kozel**. Všechny algoritmy, stavový automat i uživatelské rozhraní musí striktně dodržovat níže popsaná pravidla.

## 1. Základní Parametry Hry

* **Počet hráčů:** 4 (hraje každý sám za sebe, žádné týmy).

* **Balíček:** 32 karet (Standardní mariášový balíček).

  * **Barvy (4):** Červené (Srdce), Zelené (Piky), Žaludy, Kule.

  * **Hodnoty (8):** 7, 8, 9, 10, J (Spodek), Q (Svršek), K (Král), A (Eso).

* **Hierarchie karet v barvě (od nejnižší po nejvyšší):**
  

  $$
  \text{7} < \text{8} < \text{9} < \text{10} < \text{J} < \text{Q} < \text{K} < \text{A}
  $$

* **Speciální karta "Kozel":** Zelený svršek ($Q_{\text{zelená}}$).

* **Cíl hry:** Mít na konci hry co nejméně trestných bodů.

* **Podmínka konce hry:** Hra končí po **úplném dohrání kola** (všech 8 štychů), ve kterém alespoň jeden z hráčů dosáhne nebo překročí hranici **100 trestných bodů**.

## 2. Bodování a Kalkulace

### Hodnoty karet

* **Každá Červená karta:** 1 trestný bod (v balíčku je celkem 8 červených karet = 8 bodů).

* **Zelený svršek (Kozel):** 12 trestných bodů.

* **Ostatní karty (Zelené 7–A bez Q, Žaludy, Kule):** 0 trestných bodů.

### Násobič Hlášení Kozla (2× Multiplier)

* Pokud je v daném kole Kozel **hlášený** (viz Fáze 4.2), všechny trestné body v daném kole se **násobí dvěma (2×)**:

  * **Každá Červená karta:** 2 trestné body.

  * **Kozel:** 24 trestných bodů.

| Karta / Stav | Standardní kolo (1×) | Hlášené kolo (2×) | 
 | ----- | ----- | ----- | 
| **1× Červená karta** | 1 bod | 2 body | 
| **Zelený svršek (Kozel)** | 12 bodů | 24 bodů | 
| **Celkem trestných bodů v kole** | **20 bodů** | **40 bodů** | 

> *Poznámka k matematice hry:* Vzhledem k tomu, že Kozel sám o sobě tvoří 12 z 20 (resp. 24 z 40) bodů, **v žádném kole nemůže nastat remíza o nejvyšší počet bodů**. Hráč, který sebral Kozla, má vždy v daném kole nejvíce bodů.

## 3. Směr Hry a Určení Rozdávajícího

* **Směr rotace:** Hra probíhá **po směru hodinových ručiček** (po levici).

* **Určení Rozdávajícího (Dealer):**

  * **1. kolo hry:** Rozdávající je určen náhodně / losem.

  * **Další kola:** Rozdává vždy ten hráč, který **v minulém kole získal nejvíce trestných bodů** (tj. hráč, který v minulém kole sebral Kozla).

* **První Výnos Koly:** První kartu do 1. štychu nového kola vynáší vždy hráč **po levici rozdávajícího**.

## 4. Průběh Kola (State Machine / Gameloop)

Každé kolo se skládá z následujících fází:

### 4.1. Fáze Rozdávání

1. Balíček 32 karet se zamíchá.

2. Každému ze 4 hráčů se rozdá přesně 8 karet.

### 4.2. Fáze Hlášení Kozla (Před 1. výnosem)

1. Systém zkontroluje, který hráč drží na ruce **Zeleného svrška (Kozla)**.

2. Danému hráči se zobrazí volba:

   * **Nahlásit Kozla:** Karta se zviditelní ostatním hráčům (vyloží se lícem nahoru na stůl / označí se ikonou v ruce). Aktivuje se **2× násobič bodů pro celé kolo**.

   * **Nehlásit (Nechat v utajení):** Karta zůstává skrytá na ruce hráče. Hraje se za standardní (1×) body.

3. Karta "Kozel" zůstává v držení daného hráče a ten ji musí během hry odehrát podle standardních pravidel přiznávání barev.

### 4.3. Fáze Hraní Štychů (8 Štychů na kolo)

Každé kolo obsahuje 8 štychů. Jeden štych zahrnuje odehrání 1 karty od každého ze 4 hráčů.

#### A. Pravidla Přiznávání Barev:

1. Hráč na tahu vynese kartu $\rightarrow$ tato karta určuje **vynesenou barvu štychu**.

2. Ostatní hráči v pořadí po levici **musí přiznat barvu**:

   * Pokud má hráč na ruce alespoň jednu kartu vynesené barvy, **musí** zahrát kartu této barvy.

   * **Bez povinnosti přebíjet:** Hráč nemusí dávat vyšší kartu, může zahrát jakoukoli kartu vynesené barvy.

3. **Nemám barvu:** Pokud hráč nemá na ruce žádnou kartu vynesené barvy, může zahrát **libovolnou kartu** jiné barvy.

#### A.1 Omezení Vynášení Červené Barvy:

1. Hráč, který je na tahu s **výnosem** (zahajuje nový štych), **nesmí vynést Červenou kartu** jako barvu štychu, dokud v daném kole nebyla alespoň jedna Červená karta **odhozena do jiného štychu** (tj. zahrána kýmkoliv, ať už jako výnos nebo jako odhoz při nemožnosti přiznat barvu).

2. **Výjimka:** Pokud má hráč na ruce **pouze Červené karty** (jiné barvy již nemá), smí Červenou kartu vynést i v případě, že ještě nebyla "rozehrána".

3. Toto omezení se týká **pouze výnosu** (první karty štychu). Přiznávání barvy Červenou kartou (pokud byla Červená vynesena jiným hráčem) není tímto pravidlem nijak omezeno.

#### B. Vyhodnocení Štychu (Bez Trumfů):

* Hra **NEMÁ trumfy**.

* Štych získává hráč, který zahral **nejvyšší kartu ve vynesené barvě**.

* Karta jakékoli jiné než vynesené barvy **nikdy nemůže získat štych** (i kdyby to bylo Eso).

* Hráč, který vyhrál štych:

  1. Přičte si odehrané karty do své hromádky získaných karet.

  2. **Vynáší první kartu do následujícího štychu** (bez ohledu na to, zda štych obsahoval trestné body).

### 4.4. Vyhodnocení Kola

Po odehrání 8. štychu:

1. Pro každého hráče se sečtou trestné body ze všech karet, které v daném kole získal.

2. Body se přičtou k celkovému průběžnému skóre hráčů.

3. Systém zkontroluje celkové skóre.

## 5. Konec Hry a Rituál Prohraných

1. Pokud po vyhodnocení kola dosáhne nebo překročí jeden nebo více hráčů **100 trestných bodů**, hra končí.

2. **Určení poraženého (Loser):**

   * Poraženým je hráč s nejvyšším počtem bodů ($\ge 100$).

   * Pokud má více hráčů shodně nejvyšší počet bodů $\ge 100$, prohrávají všichni s tímto skóre.

3. **Zamečení (Mečící Rituál):**

   * Každý poražený hráč musí po skončení hry povinně zamečet.

   * **Počet zamečení:** Přesně rozdíl mezi dosaženým skóre a hranicí 100 bodů.
     

     $$
     \text{Počet mečení} = \text{Dosažené Skóre} - 100
     $$

     
     *(Příklad: Při skóre 104 bodů hráč mečí 4×).*

## 6. Datové Struktury pro Vývoj (Doporučený JSON model)

```
{
  "gameState": "DECLARING_KOZEL", // WAITING, DEALING, DECLARING_KOZEL, PLAYING_TRICK, ROUND_END, GAME_OVER
  "multiplier": 1, // 1 or 2 (if Kozel declared)
  "currentDealerIndex": 0,
  "currentTurnIndex": 1,
  "leadCard": null,
  "leadSuit": null,
  "heartsBroken": false, // true once a Červená card has been discarded into any štych this round
  "kozelPlayerIndex": 2,
  "isKozelDeclared": false,
  "currentTrick": [
    // { "playerIndex": 1, "card": { "suit": "HEARTS", "value": 12 } }
  ],
  "players": [
    {
      "id": 0,
      "name": "Hráč 1",
      "hand": [],
      "tricksWon": [],
      "roundScore": 0,
      "totalScore": 0
    }
  ]
}

```