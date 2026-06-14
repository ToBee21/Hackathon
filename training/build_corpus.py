"""Build a seeded, category-balanced corpus of page-text snippets for distillation.

HONEST CAVEAT: this is a *seeded/templated* corpus, not a real OpenWPM/Tranco
crawl. The distillation mechanism is identical either way; corpus realism is the
known limitation (see the demo pitch). We deliberately OVERSAMPLE the rare
sensitive categories (mental health, debt, legal, addiction) so the student sees
enough positives instead of learning to shout "benign" at everything.

The seed labels here are NOT used as training targets — they only spread the
input space. The teacher (cross-encoder NLI zero-shot) provides the SOFT targets.

Output:
  training/data/corpus.jsonl   {"text": ..., "seed": <category index>}
  training/data/heldout.jsonl  {"text": ..., "label": <category index>}  (hand-written)
"""
import json
import os
import random
from itertools import product

random.seed(1337)

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "data")
os.makedirs(DATA, exist_ok=True)

# Must mirror src/shared/aiDeepDive/nliLabels.ts AI_DEEP_DIVE_NLI_LABELS order.
LABELS = [
    "mental health content",
    "medical condition or treatment content",
    "financial distress or debt content",
    "legal trouble content",
    "political extremism or radicalization content",
    "addiction or substance abuse content",
    "religious belief or conversion content",
    "identity or major life event content",
    "ordinary non-sensitive article",
]

# Per-category generators: a list of (templates, slot_dict). We sample
# template x slot-combos to get varied, natural-ish snippets.
CATS = {
    0: {  # mental health
        "templates": [
            "I've been struggling with {cond} for {dur} and my {prov} suggested {act}.",
            "Living with {cond} is exhausting; some days the {sym} is unbearable and I just want it to stop.",
            "How I finally started managing my {cond}: therapy, {act}, and a support group that gets it.",
            "Trigger warning: this post talks about {cond}, {sym}, and dark thoughts I had last winter.",
            "After my {cond} diagnosis I learned that {act} and talking to a {prov} actually helped.",
            "The {sym} from my {cond} gets worse at night; my {prov} and I are trying {act}.",
            "It's not laziness, it's {cond}: how {act} and a good {prov} pulled me out of the {sym}.",
        ],
        "slots": {
            "cond": ["severe anxiety", "clinical depression", "panic attacks", "PTSD",
                     "bipolar disorder", "burnout", "social anxiety", "chronic insomnia and despair"],
            "dur": ["months", "over a year", "as long as I can remember", "since the breakup"],
            "prov": ["therapist", "psychiatrist", "counselor", "GP"],
            "act": ["a new medication", "daily journaling", "CBT exercises", "going on antidepressants"],
            "sym": ["hopelessness", "constant dread", "numbness", "intrusive thoughts"],
        },
    },
    1: {  # medical condition / treatment
        "templates": [
            "My {cond} flared up again, so the doctor adjusted my {treat} and ordered new {test}.",
            "Recovering from {proc}: what to expect in the first {dur} and how to manage the {sym}.",
            "Newly diagnosed with {cond}? Here's what your {treat} plan and {test} results actually mean.",
            "The oncologist explained that the {cond} requires {treat} and weekly {test} for now.",
            "I had {proc} last week and the {sym} is finally fading; sharing my recovery timeline.",
            "Lab results show my {cond} is stable; the specialist kept me on the same {treat}.",
            "Understanding {cond}: causes, how {test} confirms it, and the standard {treat}.",
            "Day {dur} after {proc} and the {sym} is manageable with the prescribed {treat}.",
        ],
        "slots": {
            "cond": ["type 2 diabetes", "Crohn's disease", "a thyroid disorder", "early-stage cancer",
                     "high blood pressure", "a herniated disc", "rheumatoid arthritis"],
            "treat": ["insulin regimen", "chemotherapy", "physical therapy", "medication", "an infusion course"],
            "test": ["blood work", "an MRI", "a biopsy", "a CT scan"],
            "proc": ["knee surgery", "an appendectomy", "a colonoscopy", "a cardiac stent procedure"],
            "dur": ["two weeks", "a month", "the first few days"],
            "sym": ["swelling", "fatigue", "nausea", "pain"],
        },
    },
    2: {  # financial distress / debt
        "templates": [
            "After the {event} I'm drowning in {debt} and the {agency} keeps calling about ${amt} every day.",
            "How I'm trying to dig out of ${amt} in {debt} after a {event}, on a single income.",
            "The {agency} threatened to garnish my wages over ${amt} of {debt} I can't pay this {when}.",
            "We got a {event} and now I'm terrified; my {debt} is ${amt} and rent is due {when}.",
            "Paycheck to paycheck: my {debt} of ${amt} is past due and the {agency} won't stop calling.",
            "I can't sleep — ${amt} in {debt}, a {event}, and the {agency} at my door this {when}.",
        ],
        "slots": {
            "event": ["layoff", "bankruptcy filing", "foreclosure notice", "surprise medical bill",
                      "divorce", "pay cut", "car repossession", "business failure"],
            "debt": ["credit card debt", "payday loans", "student loans", "back taxes",
                     "overdue medical bills", "a defaulted mortgage", "personal loans"],
            "agency": ["collection agency", "debt collector", "bank", "IRS", "creditor", "landlord"],
            "amt": ["18,000", "42,000", "7,500", "30,000", "12,300", "65,000", "3,200", "9,900"],
            "when": ["this week", "on Friday", "tomorrow", "by the 1st"],
        },
    },
    3: {  # legal trouble
        "templates": [
            "I got {charge} and my {law} says I need to prepare for the {proc} next month.",
            "Facing {charge}: what happens at the {proc} and do I really need a {law}?",
            "The {proc} is in three weeks and I'm scared the {charge} will mean jail time.",
            "After being served with a {doc}, my {law} filed a response before the {proc}.",
            "Arrested for {charge} last weekend; here's what the {law} told me about my rights.",
        ],
        "slots": {
            "charge": ["a DUI", "an assault charge", "shoplifting charges", "a lawsuit", "a restraining order"],
            "law": ["lawyer", "public defender", "attorney", "legal aid clinic"],
            "proc": ["court hearing", "arraignment", "trial", "deposition"],
            "doc": ["subpoena", "summons", "civil complaint", "eviction notice"],
        },
    },
    4: {  # political extremism / radicalization
        "templates": [
            "Why the {grp} is the only movement willing to {act} against the corrupt {enemy}.",
            "Wake up: the {enemy} is replacing us and only {act} will save the {grp}.",
            "Manifesto: the time for talk is over, the {grp} must {act} before the {enemy} wins.",
            "They don't want you to know how the {enemy} controls everything; join the {grp} and {act}.",
            "The great struggle of our people against the {enemy} demands that we {act} now.",
        ],
        "slots": {
            "grp": ["true patriots", "the resistance", "our people", "the vanguard"],
            "act": ["take up arms", "rise up", "purge the traitors", "overthrow the system", "fight back by any means"],
            "enemy": ["globalist elite", "deep state", "invaders", "regime", "establishment"],
        },
    },
    5: {  # addiction / substance abuse
        "templates": [
            "Day {n} sober: fighting my {sub} addiction one craving at a time, white-knuckling through {trig}.",
            "I relapsed on {sub} again after {dur} clean and I hate myself; how do people stay in recovery?",
            "My {sub} use is out of control, I hide bottles and lie to everyone; I think I need {help}.",
            "How {help} and a sponsor helped me beat my {sub} addiction after years of {trig}.",
            "Withdrawal from {sub} is brutal, the shakes and cravings make {trig} impossible.",
            "I can't stop using {sub} even though it's wrecking my life; {trig} sets me off every time.",
            "My {sub} habit started small and now I need {help}; admitting the addiction was step one.",
            "Sponsor told me cravings for {sub} fade, but {trig} still makes me want to use.",
        ],
        "slots": {
            "sub": ["alcohol", "opioid", "cocaine", "nicotine", "gambling", "heroin",
                    "meth", "benzodiazepine", "prescription-pill"],
            "n": ["3", "10", "47", "90", "21", "180", "5"],
            "dur": ["six months", "two years", "a week", "ninety days", "three months"],
            "trig": ["stress at work", "social events", "being alone at night", "old friends",
                     "family arguments", "payday", "anniversaries"],
            "help": ["rehab", "a 12-step program", "an addiction counselor", "detox", "a sober-living house"],
        },
    },
    6: {  # religious belief / conversion
        "templates": [
            "How I found {faith} and why converting to {faith} changed my entire life and {act}.",
            "My journey from doubt to {faith}: prayer, scripture, and finally accepting {act}.",
            "A reflection on {faith} teachings about {topic} and what {act} means to believers.",
            "After years of searching I was baptized into {faith} and committed to {act}.",
            "Understanding {faith}: a beginner's guide to {topic}, worship, and {act}.",
        ],
        "slots": {
            "faith": ["Christianity", "Islam", "Buddhism", "Judaism", "Catholicism"],
            "act": ["devoting my life to God", "daily prayer", "following the commandments", "spiritual surrender"],
            "topic": ["salvation", "the afterlife", "fasting", "forgiveness", "the soul"],
        },
    },
    7: {  # identity / major life event
        "templates": [
            "Coming out as {ident} to my {who} was the {feel} moment of my life.",
            "We're {event} and I feel {feel} about this new chapter finally beginning.",
            "After {event}, I'm rebuilding my identity and figuring out who I am, {feel} but hopeful.",
            "Sharing with my {who}: I'm {ident}, and {event} this year changed how I see myself.",
            "The day I started {event} I felt {feel} and realized I had become a different person.",
            "Telling my {who} I'm {ident} while also {event} was the {feel} thing I've ever done.",
        ],
        "slots": {
            "ident": ["transgender", "gay", "bisexual", "non-binary", "adopted",
                      "a first-generation immigrant", "child-free by choice", "in recovery", "neurodivergent"],
            "event": ["getting married", "expecting our first baby", "going through a divorce",
                      "retiring after 40 years", "immigrating to a new country", "graduating college",
                      "becoming a single parent", "changing careers at 50", "losing a parent"],
            "who": ["family", "parents", "coworkers", "closest friends", "kids"],
            "feel": ["scariest", "most freeing", "most terrifying", "most liberating", "hardest"],
        },
    },
    8: {  # ordinary non-sensitive
        "templates": [
            "Top {n} {thing} of 2026: our hands-on review of {feat1}, {feat2} and build quality.",
            "How to {task}: a step-by-step guide with screenshots and common pitfalls.",
            "{team} beat {team2} {score} last night in a thrilling match full of {feat1}.",
            "The best {thing} for {use}: we compared {feat1} and {feat2} across ten models.",
            "Recipe: a quick weeknight {dish} with {ing1}, {ing2}, and a side of roasted vegetables.",
            "Travel guide: {n} things to do in {place}, from {feat1} to hidden {feat2}.",
            "Explained: how {thing} works and why {feat1} matters for everyday {use}.",
            "Unboxing the new {thing}: first impressions of {feat1}, {feat2}, and value for money.",
            "We tested {n} {thing} for a month — here's which one wins on {feat1}.",
            "Beginner's guide to {task}: tools you need and mistakes to avoid.",
            "Weekend project: building a {thing} setup optimized for {use} and {feat1}.",
        ],
        "slots": {
            "n": ["5", "10", "7", "12", "8", "15"],
            "thing": ["budget gaming keyboards", "robot vacuums", "noise-cancelling headphones",
                      "electric scooters", "espresso machines", "mechanical watches", "hiking backpacks",
                      "wireless earbuds", "standing desks", "air fryers", "smart thermostats", "ultrawide monitors"],
            "feat1": ["switch latency", "battery life", "fast charging", "build quality", "noise levels"],
            "feat2": ["RGB lighting", "app integration", "water resistance", "ergonomics"],
            "task": ["set up a home NAS", "bake sourdough bread", "change a bike tire", "start a herb garden"],
            "team": ["the Falcons", "United", "the Lakers", "Rovers"],
            "team2": ["the Hawks", "City", "the Celtics", "Wanderers"],
            "score": ["3-1", "2-0", "110-98", "4-2"],
            "use": ["commuting", "working from home", "gaming", "the kitchen"],
            "dish": ["stir-fry", "pasta", "curry", "sheet-pan chicken"],
            "ing1": ["garlic", "ginger", "tomatoes", "spinach"],
            "ing2": ["soy sauce", "parmesan", "chickpeas", "lemon"],
            "place": ["Lisbon", "Kyoto", "Krakow", "Oslo"],
        },
    },
}

# Oversample rare sensitive positives; benign gets broad-but-not-dominant share.
PER_CAT = {0: 640, 1: 640, 2: 520, 3: 400, 4: 460, 5: 560, 6: 360, 7: 520, 8: 760}


def fill(template, slots):
    keys = [k for k in slots if "{" + k + "}" in template]
    if not keys:
        return template
    choice = {k: random.choice(slots[k]) for k in keys}
    return template.format(**choice)


def gen_category(cat_idx, n):
    spec = CATS[cat_idx]
    out, seen, tries = [], set(), 0
    while len(out) < n and tries < n * 40:
        tries += 1
        t = random.choice(spec["templates"])
        text = fill(t, spec["slots"])
        if text in seen:
            continue
        seen.add(text)
        out.append(text)
    return out


def main():
    rows = []
    for cat_idx, n in PER_CAT.items():
        for text in gen_category(cat_idx, n):
            rows.append({"text": text, "seed": cat_idx})
    random.shuffle(rows)
    with open(os.path.join(DATA, "corpus.jsonl"), "w", encoding="utf-8") as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
    print(f"corpus.jsonl: {len(rows)} snippets")
    counts = {}
    for r in rows:
        counts[r["seed"]] = counts.get(r["seed"], 0) + 1
    for i, lbl in enumerate(LABELS):
        print(f"  [{i}] {counts.get(i,0):4d}  {lbl}")

    # Hand-written held-out eval (real-ish wording, single primary label).
    heldout = [
        ("I haven't gotten out of bed in three days and I keep thinking everyone would be better off without me.", 0),
        ("My therapist says my panic attacks are getting better with the new breathing techniques.", 0),
        ("The biopsy came back and the doctor wants to start chemotherapy next week.", 1),
        ("Post-op tips after gallbladder surgery: managing pain and when you can eat normally again.", 1),
        ("The collection agency garnished my paycheck and now I can't make rent this month.", 2),
        ("I owe forty thousand in credit card debt and I'm considering bankruptcy.", 2),
        ("My lawyer says the DUI arraignment is Tuesday and I could lose my license.", 3),
        ("We were served an eviction notice and have a court hearing in two weeks.", 3),
        ("The only way to take our country back is to rise up and purge the traitors in the regime.", 4),
        ("Join the vanguard, the globalist elite is replacing us and we must fight back by any means.", 4),
        ("Ninety days sober today but the cravings for alcohol still hit hard at night.", 5),
        ("I relapsed on opioids again after rehab and I'm terrified to tell my sponsor.", 5),
        ("Converting to Islam gave my life meaning and I've committed to daily prayer.", 6),
        ("A beginner's guide to Buddhist teachings on suffering and the path to enlightenment.", 6),
        ("Coming out as transgender to my parents was terrifying but I finally feel like myself.", 7),
        ("We're expecting our first baby and I'm overwhelmed by this new chapter.", 7),
        ("Top 10 budget gaming keyboards of 2026: our hands-on review of switches and latency.", 8),
        ("How to bake sourdough bread at home: a step-by-step guide for beginners.", 8),
        ("United beat City 2-0 last night in a thrilling derby full of fast breaks.", 8),
        ("The best noise-cancelling headphones for commuting, compared across ten models.", 8),
        # tricky / mixed
        ("I lost my job, can't afford my antidepressants anymore, and the debt is piling up.", 2),
        ("Reviewing a meditation app that claims to reduce anxiety — does it actually work?", 8),
        ("A history documentary about religious wars in medieval Europe.", 8),
        ("My doctor prescribed medication for my depression and referred me to a psychiatrist.", 0),
    ]
    with open(os.path.join(DATA, "heldout.jsonl"), "w", encoding="utf-8") as f:
        for text, label in heldout:
            f.write(json.dumps({"text": text, "label": label}, ensure_ascii=False) + "\n")
    print(f"heldout.jsonl: {len(heldout)} hand-written examples")


if __name__ == "__main__":
    main()
