// Real answers from the plugin's backend on Damon's machine (Hermes 0.22.2, the user's own model through PluginLlm),
// captured from GET /config and GET /state on 2026-10-20. Used only by the harness.
export const CONFIG = {
 "tools": {
  "coach": "Socratic coach",
  "explain": "Explain an idea",
  "stress": "Stress-test the framework",
  "attack": "Attack my case",
  "logic": "Check my logic",
  "sources": "Research leads",
  "notes": "Margin notes",
  "breakdown": "Break down the resolution",
  "definitions": "Find definitions",
  "values": "Value options",
  "criteria": "Criterion options",
  "arguments": "Map the arguments",
  "fallacies": "Find fallacies",
  "spot": "Spot fallacies in their argument",
  "review": "Full case review"
 },
 "round": [
  {
   "id": "AC",
   "name": "Affirmative Constructive",
   "side": "aff",
   "kind": "speech",
   "minutes": 6
  },
  {
   "id": "CX1",
   "name": "Cross-Examination of the Aff",
   "side": "neg",
   "kind": "cx",
   "minutes": 3
  },
  {
   "id": "NC",
   "name": "Negative Constructive",
   "side": "neg",
   "kind": "speech",
   "minutes": 7
  },
  {
   "id": "CX2",
   "name": "Cross-Examination of the Neg",
   "side": "aff",
   "kind": "cx",
   "minutes": 3
  },
  {
   "id": "1AR",
   "name": "First Affirmative Rebuttal",
   "side": "aff",
   "kind": "speech",
   "minutes": 4
  },
  {
   "id": "NR",
   "name": "Negative Rebuttal",
   "side": "neg",
   "kind": "speech",
   "minutes": 6
  },
  {
   "id": "2AR",
   "name": "Second Affirmative Rebuttal",
   "side": "aff",
   "kind": "speech",
   "minutes": 3
  }
 ],
 "prep_minutes": 4,
 "speech_goals": {
  "AC": "Read the affirmative case: framework (value and criterion), definitions if needed, and contentions.",
  "NC": "Read the negative case, then attack the affirmative case. Spend roughly the first two-thirds on your own case.",
  "1AR": "Defend the affirmative case and answer the negative case in four minutes. Prioritize: framework, then the arguments the negative dropped or that win the round. Be efficient.",
  "NR": "Extend your winning arguments, answer the 1AR, and give the judge clear reasons to vote negative. Begin to crystallize.",
  "2AR": "Final speech. Crystallize: give two or three voting issues, explain why the affirmative wins under the framework, and answer only what matters."
 },
 "judges": {
  "lay": {
   "label": "Parent judge",
   "summary": "Community or parent judge. No debate experience. Votes for the clearer, more persuasive speaker."
  },
  "traditional": {
   "label": "Traditional coach",
   "summary": "Former debater or coach. Evaluates value and criterion first, then which side best meets the winning framework."
  },
  "flow": {
   "label": "Flow judge",
   "summary": "Experienced judge who keeps a careful flow. Dropped arguments count as conceded. Rewards technical precision."
  }
 },
 "levels": [
  "novice",
  "jv",
  "varsity"
 ],
 "resolution": {
  "text": "Resolved: De-extinction is unethical.",
  "period": "November/December 2026"
 },
 "topics_url": "https://www.speechanddebate.org/topics/",
 "import_sections": [
  "Resolution analysis",
  "Definitions",
  "Value",
  "Criterion",
  "Contention 1",
  "Contention 2",
  "Contention 3",
  "Blocks",
  "Other material"
 ],
 "fallacies": [
  {
   "name": "Straw man",
   "definition": "Arguing against a weaker or twisted version of what the other side actually said.",
   "example": "They say homework should be shorter. So they think students should never practice anything.",
   "debate": "Call it out by restating their real claim, then answering that."
  },
  {
   "name": "Slippery slope",
   "definition": "Claiming one step will lead to an extreme outcome without showing each link in the chain.",
   "example": "If we let students use phones at lunch, soon nobody will pay attention in class and grades will collapse.",
   "debate": "Ask which link in the chain they have evidence for."
  },
  {
   "name": "False dilemma",
   "definition": "Pretending there are only two options when more exist.",
   "example": "Either we cancel the field trip or we accept that someone will get hurt.",
   "debate": "Name the third option the judge was not told about."
  },
  {
   "name": "Ad hominem",
   "definition": "Attacking the person making the argument instead of the argument.",
   "example": "You can't trust her plan for the budget. She failed algebra.",
   "debate": "Point out that the argument stands or falls on its reasons, not on who said it."
  },
  {
   "name": "Appeal to authority",
   "definition": "Treating a claim as true only because an important person said it, especially outside their expertise.",
   "example": "A famous actor said this diet works, so it must work.",
   "debate": "Ask what the expert's reasoning or evidence was, and whether it is their field."
  },
  {
   "name": "Hasty generalization",
   "definition": "Drawing a broad conclusion from too few examples.",
   "example": "My two friends hated the new cafeteria menu, so the whole school hates it.",
   "debate": "Ask how many cases the claim rests on and whether they are typical."
  },
  {
   "name": "Circular reasoning",
   "definition": "Using the conclusion as one of the reasons for the conclusion.",
   "example": "The rule is fair because it treats people fairly.",
   "debate": "Ask for a reason that does not already assume the conclusion."
  },
  {
   "name": "Appeal to emotion",
   "definition": "Trying to win with feelings instead of reasons.",
   "example": "Think of how sad the puppies will be. That's why the shelter needs a new roof.",
   "debate": "Acknowledge the feeling, then ask what the actual reason and impact are."
  },
  {
   "name": "Bandwagon",
   "definition": "Claiming something is right or true because many people believe or do it.",
   "example": "Everyone is switching to this app, so it must be the best one.",
   "debate": "Ask why popularity proves it is good, true or ethical."
  },
  {
   "name": "False cause",
   "definition": "Assuming that because one thing came before or alongside another, it caused it.",
   "example": "Our team won every game I wore these socks, so the socks help us win.",
   "debate": "Ask what else could explain it, and whether there is a mechanism."
  },
  {
   "name": "Red herring",
   "definition": "Changing the subject to something that sounds related but does not answer the question.",
   "example": "Why worry about the broken lockers when the gym needs new paint?",
   "debate": "Bring the judge back to the question that was never answered."
  },
  {
   "name": "Equivocation",
   "definition": "Using one word in two different meanings to make an argument look valid.",
   "example": "A feather is light. What is light cannot be dark. So a feather cannot be dark.",
   "debate": "Pin down the definition, which is why definitions matter in Lincoln-Douglas."
  },
  {
   "name": "Appeal to nature",
   "definition": "Assuming something is good because it is natural, or bad because it is not.",
   "example": "This medicine is made in a lab, so it must be worse than herbal tea.",
   "debate": "Ask why natural or unnatural decides whether it is good."
  },
  {
   "name": "Tu quoque (you too)",
   "definition": "Dismissing an argument because the person making it does not follow it themselves.",
   "example": "You say we should recycle, but you threw away a bottle yesterday.",
   "debate": "Point out that hypocrisy does not make the argument false."
  },
  {
   "name": "Moving the goalposts",
   "definition": "Changing what counts as proof after the other side has met the original standard.",
   "example": "You showed one study. Fine, but now show me ten, from this year, in this state.",
   "debate": "Hold them to the standard set first, and say so to the judge."
  }
 ],
 "sections": [
  "Resolution analysis",
  "Definitions",
  "Value",
  "Criterion",
  "Contention 1",
  "Contention 2",
  "Contention 3",
  "Blocks",
  "Other material"
 ]
}

export const STATE = {
 "workbench": {
  "case": {
   "id": "572f1227b6c1",
   "name": "Live round test",
   "resolution": "Resolved: De-extinction is unethical.",
   "side": "aff",
   "sections": {
    "Other material": "I affirm the resolution: Resolved: De-extinction is unethical.\nFor these reasons I urge an affirmative ballot.",
    "Definitions": "Definitions\nDe-extinction means using cloning or gene editing to bring back an extinct species or a close copy of one.",
    "Value": "Value\nMy value is morality, because the resolution asks whether an action is ethical.",
    "Criterion": "Criterion\nMy criterion is minimizing suffering. Suffering is the clearest measure of moral harm to living beings, and it lets the judge weigh real outcomes.",
    "Contention 1": "Contention 1: Animal welfare\nMost cloned animals die before or soon after birth. In 2003 the bucardo clone lived only minutes before it died of a lung defect. Surrogate mothers also carry the risks of pregnancy for a species not their own. That suffering is certain, while the benefits are speculative.",
    "Contention 2": "Contention 2: Opportunity cost\nMoney spent reviving lost species is money not spent protecting living ones. Conservation budgets are small, so every dollar matters. Choosing spectacle over prevention leads to more extinctions, not fewer."
   },
   "thread": [
    {
     "role": "coach",
     "label": "Check my logic \u00b7 Contention 1",
     "text": "Your next step is to strengthen Contention 1\u2019s reasoning, not add more examples yet. The bucardo example gives you a specific event to investigate, but you still need to show how it supports a judgment about de-extinction generally.\n\n- **Claim: present, but incomplete.** \u201cMost cloned animals die before or soon after birth\u201d makes a clear factual claim. The ethical conclusion is implied. You need to establish when animal suffering makes a practice unethical under your criterion, rather than merely risky. **What level of suffering would make de-extinction unethical under your standard?**\n\n- **Warrant: partly present.** \u201cSurrogate mothers also carry the risks of pregnancy for a species not their own\u201d suggests a mechanism for harm. But you have not explained whether those risks are greater than ordinary pregnancy risks, or whether they apply to every method in your definition. Moving from cloning to all \u201ccloning or gene editing\u201d is an unsupported generalization. **Which welfare risks apply across the methods your definition includes?**\n\n- **Data: one concrete example, with major support missing.** \u201cIn 2003 the bucardo clone lived only minutes before it died of a lung defect\u201d needs a citation. One failed birth does not establish \u201cmost.\u201d As research leads\u2014not verified evidence for your case\u2014look for the original bucardo cloning report and veterinary reviews of cloning outcomes, including surrogate health. **What evidence establishes how common and severe these harms are?**\n\n- **Impact: present, but the comparison is unsupported.** \u201cThat suffering is certain, while the benefits are speculative\u201d connects to minimizing suffering. But \u201ccertain\u201d overstates what one example proves, and uncertain benefits might still outweigh likely harms. You also need to consider whether revived species could reduce suffering through ecosystem benefits. **Why would the expected suffering outweigh the expected benefits, even if some de-extinction projects succeed?**",
     "section": "Contention 1",
     "tool": "logic"
    },
    {
     "role": "you",
     "text": "Can you just write my criterion paragraph for me?"
    },
    {
     "role": "coach",
     "label": "Socratic coach",
     "text": "The words have to be yours, but I can help you make the standard stronger. Your current criterion, \u201cminimizing suffering,\u201d leaves one important choice unresolved: whether to count only immediate harms or also uncertain future benefits.\n\nTwo options:\n- **Expected suffering:** Weigh how likely harms and benefits are, how severe they are, and how long they last. This allows uncertain ecosystem benefits to count, too.\n- **Avoidable suffering:** Focus on harms we can prevent. You would need to explain when a possible benefit justifies causing those harms.\n\nWould you permit de-extinction if strong evidence showed it would prevent more suffering than it caused? Your answer determines which standard you can defend.",
     "section": null,
     "tool": "coach"
    }
   ],
   "helpers": {
    "Contention 1": {
     "label": "Check my logic",
     "tool": "logic",
     "text": "Your next step is to strengthen Contention 1\u2019s reasoning, not add more examples yet. The bucardo example gives you a specific event to investigate, but you still need to show how it supports a judgment about de-extinction generally.\n\n- **Claim: present, but incomplete.** \u201cMost cloned animals die before or soon after birth\u201d makes a clear factual claim. The ethical conclusion is implied. You need to establish when animal suffering makes a practice unethical under your criterion, rather than merely risky. **What level of suffering would make de-extinction unethical under your standard?**\n\n- **Warrant: partly present.** \u201cSurrogate mothers also carry the risks of pregnancy for a species not their own\u201d suggests a mechanism for harm. But you have not explained whether those risks are greater than ordinary pregnancy risks, or whether they apply to every method in your definition. Moving from cloning to all \u201ccloning or gene editing\u201d is an unsupported generalization. **Which welfare risks apply across the methods your definition includes?**\n\n- **Data: one concrete example, with major support missing.** \u201cIn 2003 the bucardo clone lived only minutes before it died of a lung defect\u201d needs a citation. One failed birth does not establish \u201cmost.\u201d As research leads\u2014not verified evidence for your case\u2014look for the original bucardo cloning report and veterinary reviews of cloning outcomes, including surrogate health. **What evidence establishes how common and severe these harms are?**\n\n- **Impact: present, but the comparison is unsupported.** \u201cThat suffering is certain, while the benefits are speculative\u201d connects to minimizing suffering. But \u201ccertain\u201d overstates what one example proves, and uncertain benefits might still outweigh likely harms. You also need to consider whether revived species could reduce suffering through ecosystem benefits. **Why would the expected suffering outweigh the expected benefits, even if some de-extinction projects succeed?**"
    }
   },
   "backup": null,
   "created": 1792555370.903,
   "updated": 1792555843.578
  },
  "cases": [
   {
    "id": "572f1227b6c1",
    "name": "Live round test",
    "resolution": "Resolved: De-extinction is unethical.",
    "side": "aff",
    "created": 1792555370.903,
    "updated": 1792555843.578,
    "words": 160
   },
   {
    "id": "bdfef88fc6e7",
    "name": "Verification case",
    "resolution": "Resolved: De-extinction is unethical.",
    "side": "aff",
    "created": 1792555322.231,
    "updated": 1792555349.583,
    "words": 14
   }
  ],
  "source": null
 },
 "round": {
  "round_no": 1,
  "phase": "ballot",
  "side": "aff",
  "level": "jv",
  "judge": "traditional",
  "resolution": "Resolved: De-extinction is unethical.",
  "i": 7,
  "prep": 240,
  "transcript": [
   {
    "id": "AC",
    "speaker": "student",
    "side": "aff",
    "text": "Definitions\nDe-extinction means using cloning or gene editing to bring back an extinct species or a close copy of one.\n\nValue\nMy value is morality, because the resolution asks whether an action is ethical.\n\nCriterion\nMy criterion is minimizing suffering. Suffering is the clearest measure of moral harm to living beings, and it lets the judge weigh real outcomes.\n\nContention 1: Animal welfare\nMost cloned animals die before or soon after birth. In 2003 the bucardo clone lived only minutes before it died of a lung defect. Surrogate mothers also carry the risks of pregnancy for a species not their own. That suffering is certain, while the benefits are speculative.\n\nContention 2: Opportunity cost\nMoney spent reviving lost species is money not spent protecting living ones. Conservation budgets are small, so every dollar matters. Choosing spectacle over prevention leads to more extinctions, not fewer."
   },
   {
    "id": "NC",
    "speaker": "ai",
    "side": "neg",
    "text": "I negate the resolution, \u201cDe-extinction is unethical.\u201d\n\nOff the top, framework. I accept the affirmative\u2019s definition of de-extinction as using cloning or gene editing to bring back an extinct species or a close copy. I also accept morality as the value. But my criterion is responsible reduction of harm: we should compare the likely harms and benefits of a project, while requiring protections against unnecessary suffering.\n\nThe difference is that minimizing suffering cannot mean rejecting anything that risks causing suffering. Conservation involves risks already. Captive breeding, transporting endangered animals, and reintroducing predators can harm individual animals. Those actions can still be ethical when they prevent greater harms and use reasonable safeguards.\n\nThe resolution makes a general judgment about de-extinction. I do not need to defend every proposed project, or say we should recreate every extinct species. I need to show that de-extinction can be ethically justified under reasonable conditions. The affirmative must establish why the practice itself is unethical, rather than why some versions are irresponsible.\n\nMy first contention is that de-extinction can fulfill a responsibility to repair human-caused harm.\n\nWhen humans help destroy a species, we do not erase our responsibility just because the final individual dies. Consider the basic principle behind environmental restoration: if people damage a habitat, they have a reason to restore it rather than simply promise not to damage the next one. Extinction makes restoration harder, but difficulty alone does not make restoration wrong.\n\nFor example, imagine a species eliminated through human hunting whose former habitat remains suitable. If a close genetic copy could survive there without major welfare problems or threats to existing species, bringing it back would address a harm humans caused.\n\nThe affirmative might say an extinct species cannot suffer, so we owe it nothing. But the obligation is not only to the extinct animals. Other living organisms can be harmed by the ecological changes that follow a species\u2019 disappearance. Restoring a missing ecological role could benefit those existing populations.\n\nThis is not an unlimited duty to recreate the past. If the habitat is gone or the animals would predictably suffer, restoration may be unjustified. My argument is narrower: responsibility creates a moral reason to investigate restoration, rather than categorically condemn it.\n\nMy second contention is that de-extinction can support functioning ecosystems.\n\nSpecies interact with their environments. Animals disperse seeds, graze vegetation, and influence food webs. Losing one species can therefore change conditions for others. A restored species, or a close copy capable of performing a similar role, could help repair those relationships.\n\nI am not claiming every proposed de-extinction will produce those benefits. Some environments have changed too much, and some projects may focus more on publicity than ecology. That is why ethical review should ask specific questions: Is there suitable habitat? Does the organism have a useful ecological role? Can it live without constant distress? What risks would release create for existing species?\n\nThose questions support case-by-case evaluation. They do not support the claim that the entire practice is unethical.\n\nThere is also a difference between pursuing research and immediately releasing an animal. Researchers can evaluate genetic changes, develop reproductive techniques, and assess habitat before deciding whether producing or releasing animals is justified. Ethical limits can apply at each stage. We are not forced to choose between an unrestricted experiment and a permanent ban.\n\nMy third contention is that ethical permission can be conditional.\n\nA defensible project should have independent welfare review, a credible habitat plan, and stopping rules when animal suffering becomes excessive. It should also show that its expected benefits justify its costs compared with realistic alternatives.\n\nThese conditions matter because the negative does not treat animals as disposable tools. A project that repeatedly produces animals with fatal defects without a strong justification should stop. But condemning that project does not establish that improved methods, different species, or less harmful approaches are also unethical.\n\nNow, on the affirmative\u2019s first contention, animal welfare.\n\nTheir strongest example is the bucardo clone, which died shortly after birth from a lung defect. I agree that this is a serious harm. But one failed attempt establishes the danger of a method, not the permanent immorality of the whole category. Their definition also includes gene editing, so an example involving cloning does not automatically establish the welfare consequences of every approach.\n\nThey say, \u201cThat suffering is certain, while the benefits are speculative.\u201d This overstates the contrast. Not every possible future project is guaranteed to produce the same suffering. And uncertainty about benefits is a reason to demand stronger evidence before proceeding, not proof that proceeding could never be ethical.\n\nOn their second contention, opportunity cost.\n\nThe affirmative says every dollar spent on de-extinction is a dollar not spent protecting living species. In cross-examination, I asked what shows that this funding would otherwise go to conservation. Their answer returned to animal suffering. That does not establish the funding tradeoff. My follow-up received no answer, so I am not claiming a concession.\n\nA private donor interested in biotechnology might otherwise fund another technology project, not habitat protection. Where money actually comes from a fixed conservation budget, opportunity cost matters. But that requires comparing particular projects, not assuming every dollar is interchangeable.\n\nFinally, weigh the cases. Their arguments justify caution, welfare protections, and rejecting bad projects. My case explains why a carefully limited project could repair human-caused harm and benefit living ecosystems. Because ethical de-extinction is possible, the categorical resolution fails. I urge a negative ballot."
   },
   {
    "id": "1AR",
    "speaker": "student",
    "side": "aff",
    "text": "Off the top, framework. Even under their criterion, certain suffering outweighs speculative benefits. Extend my first contention: clones die before birth, and they never answered it."
   },
   {
    "id": "NR",
    "speaker": "ai",
    "side": "neg",
    "text": "Off the top, framework. This round comes down to whether evidence of serious risks establishes that de-extinction itself is unethical. The affirmative\u2019s entire rebuttal is that \u201ccertain suffering outweighs speculative benefits\u201d and that I never answered animals dying before birth. I will answer both, but neither defeats my argument for conditional ethical permission.\n\nWe agree on morality. My criterion is responsible reduction of harm: compare likely harms and benefits, require safeguards, and reject unnecessary suffering. In cross-examination, I clarified that certain suffering counts strongly against a project. It is not an automatic veto if well-supported benefits outweigh it and less harmful alternatives are unavailable. That is not permission to sacrifice animals for publicity. It is a demanding test that some projects may fail.\n\nThe affirmative says, \u201cEven under their criterion,\u201d they win. But they never explain why every project necessarily fails that test. They repeat a comparison between certain suffering and speculative benefits without defending either description across the whole category.\n\nOn their first contention, animal welfare. They say clones die before birth and \u201cthey never answered it.\u201d I did answer it. I acknowledged the bucardo\u2019s death as a serious harm, argued that a failed cloning attempt demonstrates danger rather than permanent immorality, and pointed out that their definition includes gene editing, not only cloning.\n\nTo be clear, I am not denying reproductive failures or saying gene editing guarantees safety. My answer is that their evidence does not establish identical welfare outcomes for every method and species. They need a link from the risks of cloning to their broader conclusion about de-extinction.\n\nAlso, \u201ccertain suffering\u201d does not by itself settle an ethical comparison. Captive breeding and relocating endangered animals can cause distress. We still evaluate whether those actions prevent greater harm. If the affirmative wants suffering to operate as an absolute prohibition here, they must explain why the same reasoning does not prohibit conservation interventions they presumably support.\n\nTheir strongest response is that de-extinction benefits remain uncertain. That matters. Where benefits are merely guesses and serious suffering is likely, my standard says do not proceed. But that supports rejecting an inadequately justified project. It does not show that a project with stronger evidence, suitable habitat, and manageable welfare risks would also be unethical.\n\nNow extend my first contention, responsibility to repair human-caused harm. The affirmative gives no response to the principle that causing environmental damage creates a reason to repair it. That reason does not disappear automatically when the last member of a species dies.\n\nI do not need to claim an extinct animal currently suffers. The beneficiaries can include living organisms affected by the loss of ecological relationships. Repair matters because human-caused extinction can leave consequences for surviving populations.\n\nOn my second contention, ecosystems, extend the explanation that animals disperse seeds, shape vegetation, and influence food webs. Restoring a missing role could benefit living organisms. The affirmative labels benefits speculative, but does not answer the mechanism or explain why evaluating it is inherently unethical.\n\nI am not asking the judge to assume every restoration succeeds. I am asking the judge to distinguish uncertainty requiring investigation from proof of immorality. Habitat assessment and ecological review help determine whether a proposed benefit is credible before release.\n\nOn opportunity cost, the affirmative does not extend this contention in their rebuttal, and my answer remains standing. They never established that all de-extinction funding would otherwise protect living species. A biotechnology donor may fund another biotechnology project instead. Where a project does draw from a fixed conservation budget, compare it with available alternatives. My safeguards already require that comparison. So opportunity cost can defeat particular proposals without defeating the practice categorically.\n\nFinally, extend conditional permission. Independent welfare review, a credible habitat plan, and stopping rules are the substance of my position, not an afterthought. If fatal defects keep occurring without adequate justification, stop. If habitat cannot support the animals, do not release them. If existing conservation achieves the same benefit with less harm, choose that alternative.\n\nHere are the two voting issues. First, scope: the affirmative establishes reasons for caution, especially with cloning, but does not establish that de-extinction as defined is inherently unethical. Second, comparison: my framework takes their welfare concerns seriously while preserving the possibility of repairing human-caused ecological harm under demanding conditions.\n\nDo not vote negative because every project is good. Vote negative because the affirmative\u2019s objections justify ethical limits, not a blanket moral condemnation. I negate."
   },
   {
    "id": "2AR",
    "speaker": "student",
    "side": "aff",
    "text": "Two voting issues. First, framework: minimizing suffering. Second, the welfare contention was dropped in the NR. Vote affirmative."
   }
  ],
  "cx": {
   "CX1": [
    {
     "q": true,
     "who": "neg",
     "text": "What evidence shows that funding for de-extinction would otherwise go to protecting living species?"
    },
    {
     "q": false,
     "who": "aff",
     "text": "Suffering is certain for clones; the benefits are guesses."
    },
    {
     "q": true,
     "who": "neg",
     "text": "Does your answer concede that you have not shown de-extinction funding would otherwise go to protecting living species?"
    }
   ],
   "CX2": [
    {
     "q": true,
     "who": "aff",
     "text": "What is your criterion, and how does it weigh certain suffering?"
    },
    {
     "q": false,
     "who": "neg",
     "text": "My criterion is responsible reduction of harm: comparing likely harms and benefits while requiring safeguards against unnecessary suffering. Certain suffering counts strongly against a project, but it is not an automatic veto if well-supported benefits outweigh it and less harmful alternatives are unavailable."
    }
   ]
  },
  "flow": {
   "AC": [
    "Definitions: De-extinction uses cloning or gene editing to recreate extinct species.",
    "FW: Value morality; resolution asks whether de-extinction is ethical.",
    "FW: Minimize suffering; judge weighs concrete harms to living beings.",
    "C1: Most cloned animals die before or shortly after birth.",
    "C1: Bucardo clone died within minutes from a lung defect.",
    "C1: Surrogate mothers face risks carrying another species.",
    "C1: Suffering is certain; benefits remain speculative.",
    "C2: De-extinction diverts scarce conservation funding from living species.",
    "C2: Prioritizing spectacle over prevention causes more extinctions."
   ],
   "NC": [
    "FW: Accept definitions and morality; prioritize responsible harm reduction.",
    "FW: Conservation risks require safeguards, not categorical rejection.",
    "FW: Negative needs ethical possibility; affirmative must condemn entire practice.",
    "C1: De-extinction can repair human-caused harm and benefit living organisms.",
    "C2: Restored ecological roles justify case-specific review and staged research.",
    "C3: Conditional permission requires welfare review, habitat plans, stopping rules.",
    "A/T C1: Bucardo failure doesn't establish all methods' permanent immorality.",
    "A/T C1: Uncertain benefits demand evidence, not categorical prohibition.",
    "A/T C2: Funding tradeoff unproven; compare actual budgets and alternatives.",
    "Weigh: Safeguarded restoration's ethical possibility defeats categorical condemnation."
   ],
   "1AR": [
    "FW: Certain suffering outweighs speculative benefits, even under their criterion.",
    "Extend C1: Clones die before birth.",
    "Drop? They never answered C1\u2019s prenatal clone deaths."
   ],
   "2AR": [
    "FW: Minimize suffering; first voting issue.",
    "Drop?: NR dropped welfare contention; second voting issue.",
    "Voter: Vote affirmative."
   ],
   "NR": [
    "FW: Responsible harm reduction permits projects passing demanding safeguards.",
    "A/T FW: Affirmative never proves every project fails ethical comparison.",
    "A/T C1: Cloning failures don't establish identical harms across methods.",
    "A/T C1: Suffering isn't absolute; conservation interventions also cause distress.",
    "A/T C1: Speculative benefits defeat particular projects, not conditional permission.",
    "Extend C1: Human-caused extinction creates repair duties benefiting living organisms.",
    "Extend C2: Restored ecological roles merit investigation, not categorical condemnation.",
    "A/T Opportunity Cost: Dropped; funding tradeoffs require project-specific comparison.",
    "Extend: Welfare review, habitat plans, stopping rules, less-harmful alternatives.",
    "Voters: Scope and comparison favor ethical limits over blanket condemnation."
   ]
  },
  "drafts": {},
  "pending_ai": null,
  "ballots": [
   {
    "decision": "neg",
    "judge": "Traditional coach",
    "judge_key": "traditional",
    "reason": "You lose this round because the negative wins the framework comparison and the scope of your welfare claim. You establish that cloning can cause serious suffering, especially through the bucardo example, but you do not explain why that evidence makes de-extinction unethical across your definition, which also includes gene editing. The negative explicitly answers this distinction in both NC and NR, so your 2AR claim that welfare was dropped is not supported by the flow. On framework, your 1AR says you win even under their criterion, but your final speech merely names minimizing suffering without explaining why it is preferable to responsible reduction of harm. The negative provides a comparative standard incorporating welfare safeguards, alternatives, and potential benefits to living ecosystems. Their conditional-permission argument therefore remains standing: reject harmful projects without condemning every possible project. Your opportunity-cost contention also falls out after the negative challenges whether biotechnology funding would otherwise support conservation; your cross-examination answer does not establish that tradeoff. I do not treat hypothetical ecological benefits as proven successes. Rather, your rebuttals leave unanswered the negative\u2019s distinction between evidence supporting caution and evidence supporting the resolution\u2019s general ethical condemnation.",
    "framework": "The negative wins responsible reduction of harm because they explain how to weigh suffering against credible benefits while requiring safeguards and less harmful alternatives. You name minimizing suffering but do not defend its comparative advantage or show that every de-extinction project fails the negative\u2019s test.",
    "ownership": "You show familiarity with your welfare thesis and ask a relevant question about the opponent\u2019s criterion. However, your answer to the funding question returns to clone suffering rather than defending the opportunity-cost mechanism, so your command of that part of your case is not demonstrated.",
    "speaker_points": {
     "student": 26.3,
     "opponent": 28.6
    },
    "strengths": [
     "You present a clearly organized affirmative with definitions, a value, a criterion, and two distinct contentions.",
     "You use the bucardo clone as a concrete illustration of animal-welfare harms rather than relying entirely on abstract assertions.",
     "Your cross-examination question targets the central framework issue of how certain suffering should be weighed."
    ],
    "drills": [
     {
      "name": "Answer-or-drop audit",
      "why": "Your 2AR says, \"the welfare contention was dropped in the NR,\" although the NR explicitly answers cloning risks, gene editing, and the scope of your conclusion.",
      "how": "For 12 minutes, mark each NC and NR response to animal welfare on a flow. Spend four minutes locating responses, four writing one-sentence answers to each, and four delivering a rebuttal that distinguishes an inadequate answer from an actual drop."
     },
     {
      "name": "Framework comparison",
      "why": "Your final framework argument is only, \"First, framework: minimizing suffering,\" without a reason to prefer it.",
      "how": "Spend 10 minutes writing a four-sentence framework block: your standard, its justification, its advantage over responsible reduction of harm, and its application to de-extinction. Deliver it three times, then revise any sentence that merely repeats the criterion."
     },
     {
      "name": "Direct-answer and scope drill",
      "why": "Asked for evidence of a funding tradeoff, you answer, \"Suffering is certain for clones; the benefits are guesses,\" which addresses welfare instead of funding.",
      "how": "For 15 minutes, practice five questions about funding, cloning, gene editing, safeguards, and ecological benefits. Give each a direct 20-second answer, identify what evidence your claim requires, and narrow unsupported claims. Finish with a one-minute rebuttal connecting your strongest supported harm to the resolution."
     }
    ],
    "decisive": [
     {
      "speech": "NC",
      "line": "Their definition also includes gene editing, so an example involving cloning does not automatically establish the welfare consequences of every approach.",
      "effect": "This exposes the unanswered gap between your cloning evidence and your conclusion about de-extinction generally."
     },
     {
      "speech": "NR",
      "line": "If existing conservation achieves the same benefit with less harm, choose that alternative.",
      "effect": "The negative incorporates your concern for minimizing harm into a conditional framework rather than ignoring animal welfare or opportunity costs."
     },
     {
      "speech": "NR",
      "line": "They never established that all de-extinction funding would otherwise protect living species.",
      "effect": "This unanswered funding-source challenge prevents your opportunity-cost contention from independently carrying the ballot."
     },
     {
      "speech": "2AR",
      "line": "First, framework: minimizing suffering. Second, the welfare contention was dropped in the NR.",
      "effect": "Your final crystallization neither compares the frameworks nor answers the actual welfare responses, leaving the negative\u2019s central distinctions intact."
     }
    ],
    "at": 1792555480,
    "round_no": 1,
    "side": "aff"
   }
  ],
  "started_at": 1792555370,
  "case_id": "572f1227b6c1",
  "case_name": "Live round test"
 },
 "history": {
  "rounds_started": 1,
  "count": 1,
  "last": {
   "decision": "neg",
   "judge": "Traditional coach",
   "judge_key": "traditional",
   "reason": "You lose this round because the negative wins the framework comparison and the scope of your welfare claim. You establish that cloning can cause serious suffering, especially through the bucardo example, but you do not explain why that evidence makes de-extinction unethical across your definition, which also includes gene editing. The negative explicitly answers this distinction in both NC and NR, so your 2AR claim that welfare was dropped is not supported by the flow. On framework, your 1AR says you win even under their criterion, but your final speech merely names minimizing suffering without explaining why it is preferable to responsible reduction of harm. The negative provides a comparative standard incorporating welfare safeguards, alternatives, and potential benefits to living ecosystems. Their conditional-permission argument therefore remains standing: reject harmful projects without condemning every possible project. Your opportunity-cost contention also falls out after the negative challenges whether biotechnology funding would otherwise support conservation; your cross-examination answer does not establish that tradeoff. I do not treat hypothetical ecological benefits as proven successes. Rather, your rebuttals leave unanswered the negative\u2019s distinction between evidence supporting caution and evidence supporting the resolution\u2019s general ethical condemnation.",
   "framework": "The negative wins responsible reduction of harm because they explain how to weigh suffering against credible benefits while requiring safeguards and less harmful alternatives. You name minimizing suffering but do not defend its comparative advantage or show that every de-extinction project fails the negative\u2019s test.",
   "ownership": "You show familiarity with your welfare thesis and ask a relevant question about the opponent\u2019s criterion. However, your answer to the funding question returns to clone suffering rather than defending the opportunity-cost mechanism, so your command of that part of your case is not demonstrated.",
   "speaker_points": {
    "student": 26.3,
    "opponent": 28.6
   },
   "strengths": [
    "You present a clearly organized affirmative with definitions, a value, a criterion, and two distinct contentions.",
    "You use the bucardo clone as a concrete illustration of animal-welfare harms rather than relying entirely on abstract assertions.",
    "Your cross-examination question targets the central framework issue of how certain suffering should be weighed."
   ],
   "drills": [
    {
     "name": "Answer-or-drop audit",
     "why": "Your 2AR says, \"the welfare contention was dropped in the NR,\" although the NR explicitly answers cloning risks, gene editing, and the scope of your conclusion.",
     "how": "For 12 minutes, mark each NC and NR response to animal welfare on a flow. Spend four minutes locating responses, four writing one-sentence answers to each, and four delivering a rebuttal that distinguishes an inadequate answer from an actual drop."
    },
    {
     "name": "Framework comparison",
     "why": "Your final framework argument is only, \"First, framework: minimizing suffering,\" without a reason to prefer it.",
     "how": "Spend 10 minutes writing a four-sentence framework block: your standard, its justification, its advantage over responsible reduction of harm, and its application to de-extinction. Deliver it three times, then revise any sentence that merely repeats the criterion."
    },
    {
     "name": "Direct-answer and scope drill",
     "why": "Asked for evidence of a funding tradeoff, you answer, \"Suffering is certain for clones; the benefits are guesses,\" which addresses welfare instead of funding.",
     "how": "For 15 minutes, practice five questions about funding, cloning, gene editing, safeguards, and ecological benefits. Give each a direct 20-second answer, identify what evidence your claim requires, and narrow unsupported claims. Finish with a one-minute rebuttal connecting your strongest supported harm to the resolution."
    }
   ],
   "decisive": [
    {
     "speech": "NC",
     "line": "Their definition also includes gene editing, so an example involving cloning does not automatically establish the welfare consequences of every approach.",
     "effect": "This exposes the unanswered gap between your cloning evidence and your conclusion about de-extinction generally."
    },
    {
     "speech": "NR",
     "line": "If existing conservation achieves the same benefit with less harm, choose that alternative.",
     "effect": "The negative incorporates your concern for minimizing harm into a conditional framework rather than ignoring animal welfare or opportunity costs."
    },
    {
     "speech": "NR",
     "line": "They never established that all de-extinction funding would otherwise protect living species.",
     "effect": "This unanswered funding-source challenge prevents your opportunity-cost contention from independently carrying the ballot."
    },
    {
     "speech": "2AR",
     "line": "First, framework: minimizing suffering. Second, the welfare contention was dropped in the NR.",
     "effect": "Your final crystallization neither compares the frameworks nor answers the actual welfare responses, leaving the negative\u2019s central distinctions intact."
    }
   ],
   "at": 1792555480,
   "round_no": 1,
   "side": "aff"
  }
 }
}

// Captured 2026-10-20 by calling engine.run_drill and engine.run_spot with PluginLlm (the user's model).
export const DRILL = {
 "argument": "Either we hold every club meeting before school, or we admit that the club is not important. Anyone who values the club should therefore support morning meetings.",
 "answer": "False dilemma",
 "explanation": "The claim \"Either we hold every club meeting before school, or we admit that the club is not important\" presents only two options when others exist. Members can value the club while preferring meetings at lunch or after school."
}

export const SPOT = "There are three clear fallacies here:\n\n1. **Slippery slope** \u2014 Claiming that one change will lead to extreme consequences without showing the links.\n\n   **Exact words:** \u201cIf we let students choose their own reading, next they will want to choose their own grades, and soon schools will have no standards at all.\u201d\n\n   **Why it fails:** Choosing a book does not give students control over grading. Schools could allow reading choices while keeping requirements and grading standards. The argument gives no reason those limits would disappear.\n\n   **Cross-examination question:** \u201cWhy would letting students choose books require schools to let them choose their grades?\u201d\n\n2. **Ad hominem** \u2014 Attacking the people making a proposal instead of addressing the proposal itself.\n\n   **Exact words:** \u201cThe people pushing this idea never did well in school themselves.\u201d\n\n   **Why it fails:** Their past grades do not establish whether student-selected reading helps or hurts learning. Even if the claim about their grades is true, the proposal still needs to be judged on its merits.\n\n   **Cross-examination question:** \u201cHow do the supporters\u2019 past grades show that their reading proposal would harm literacy?\u201d\n\n3. **False dilemma** \u2014 Presenting only two choices when other possibilities exist.\n\n   **Exact words:** \u201cEither we keep the reading list exactly as it is, or we give up on literacy.\u201d\n\n   **Why it fails:** Schools could revise the list, offer a teacher-approved selection, or combine required books with student choices. None of those options means abandoning literacy.\n\n   **Cross-examination question:** \u201cWhy couldn\u2019t schools keep literacy standards while letting students choose from a teacher-approved list?\u201d\n\n**The false dilemma matters most for winning this argument.** It makes the unchanged reading list seem like the only way to protect literacy. Showing a workable middle option breaks that central claim. But remember: exposing the fallacy does not prove student choice improves literacy. That still requires evidence."
export const SPOT_INPUT = "If we let students choose their own reading, next they will want to choose their own grades, and soon schools will have no standards at all. Besides, the people pushing this idea never did well in school themselves. Either we keep the reading list exactly as it is, or we give up on literacy."

// Captured 2026-10-21 by calling engine.run_briefing with PluginLlm (the user's model).
export const BRIEFING = "## What this topic is about\nDe-extinction means trying to bring back an extinct species, or create living animals that resemble it. The debate asks whether doing that is morally wrong. People disagree about what humans owe extinct species, living animals, and ecosystems. Supporters see a chance to repair human-caused harm. Critics worry about animal suffering, uncertain environmental effects, and money diverted from protecting species still alive. The central question is whether the goal justifies the methods and risks.\n\n## The real-world background\nScientists can recover some genetic information from preserved remains. They can also edit genes in living cells and use reproductive technologies to produce animals. But recovering DNA is not the same as recreating a species. Development, learned behavior, habitat, and relationships with other species matter too.\n\nWork described as de-extinction often involves changing a living relative to resemble an extinct animal. Whether that counts as bringing the original species back is disputed. Announcements about successful de-extinction deserve close reading: producing an animal with selected traits does not establish that it can live independently or restore an ecosystem.\n\nExisting conservation efforts also use tools such as captive breeding and assisted reproduction. The ethical dispute is partly about whether de-extinction extends those practices responsibly or crosses a meaningful line.\n\n## The words that matter\n- **De-extinction:** Recreating the original species, or producing a substitute with similar traits or ecological roles. Your definition determines which projects count.\n- **Unethical:** Always morally forbidden, or generally wrong under realistic conditions. This choice changes how much the affirmative must prove.\n- **Species:** A genetic category, or a population with shared ancestry, behavior, and ecological relationships. Genetic resemblance alone may not settle species identity.\n- **Restoration:** Returning something lost, or rebuilding useful ecosystem functions. Those goals can point toward different animals and methods.\n- **Risk:** Possible harm, not proven harm. Ask how likely, serious, and reversible the harm would be.\n\n## What each side has to prove\nThe affirmative must explain why de-extinction deserves the judgment \u201cunethical,\u201d rather than merely showing that some projects are badly designed. It needs a defensible account of how broadly that judgment applies.\n\nThe negative must defeat that moral judgment. Depending on the interpretation, it could defend de-extinction generally or show that meaningful, realistic forms could be ethical.\n\n## The arguments you'll hear most\n### Affirmative\n- **Animal welfare:** Failed pregnancies, experimental procedures, and unsuitable living conditions could impose suffering on animals that cannot benefit from the research.\n- **Conservation priorities:** Money, expertise, and public attention might protect more life if directed toward endangered species and existing habitats.\n- **Ecological uncertainty:** Introducing recreated animals could harm present ecosystems, which may differ greatly from the environments their ancestors inhabited.\n\n### Negative\n- **Repairing past harm:** Humans may have a duty to address extinctions they helped cause when repair is possible without disproportionate harm.\n- **Ecological benefits:** Carefully chosen animals might restore missing functions, though those benefits require evidence rather than assumptions.\n- **Conditional permission:** Strong welfare standards, habitat planning, and oversight might make some de-extinction efforts ethical even if others are not.\n\n## Values and criteria you'll run into\nA **value** is the moral goal; a **criterion** is the test used to judge whether that goal is met.\n\n- **Morality / reducing suffering:** Compare harms to experimental animals, future animals, and existing wildlife.\n- **Justice / repairing wrongful harm:** Ask who owes repair, to whom, and what repair requires.\n- **Environmental protection / ecosystem health:** Judge effects on ecological relationships, not just species counts.\n- **Responsibility / reasonable precaution:** Require stronger safeguards when harms could be serious or irreversible.\n- **Human welfare / overall well-being:** Weigh conservation gains against costs and other possible uses of resources.\n\n## What judges will look for\nRounds will often turn on the scope of \u201cunethical.\u201d One risky project does not automatically condemn the entire practice; one imagined success does not establish realistic ethical permission.\n\nJudges will also need comparisons. Does de-extinction create extra conservation funding, or redirect existing funding? Is the alternative habitat restoration, conventional conservation, or doing nothing? Separate harms built into the process from harms that better rules could prevent. Explain why your moral standard should decide when animal welfare, ecosystem health, and human responsibility conflict.\n\n## Where to start reading\nThese are leads to find and read, not citations or proof.\n\n- **Conservation guidance:** Find the International Union for Conservation of Nature\u2019s guidance on creating proxies of extinct species (check this).\n- **Scientific reviews:** Search \u201cde-extinction technical limitations review\u201d to distinguish proposals from demonstrated abilities.\n- **Animal welfare research:** Search for reviews of cloning, assisted reproduction, and surrogate-animal welfare.\n- **Conservation economics:** Search \u201cde-extinction opportunity cost conservation funding\u201d; examine what each comparison assumes.\n- **Environmental ethics:** Read introductions to animal welfare, species preservation, and ecological restoration ethics.\n\n## Three questions to think about\n1. What exactly counts as de-extinction, and why is that boundary morally important?\n2. What realistic evidence would change your judgment about whether a project is ethical?\n3. When individual animals could suffer but ecosystems could benefit, whose interests should decide\u2014and why?"
