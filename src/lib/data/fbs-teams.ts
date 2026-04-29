// NCAA Division I FBS Football Teams
// Colors, logos, and abbreviations for team selection in Pick'em

export interface FBSTeam {
  name: string;
  shortName: string;
  abbreviation: string;
  conference: string;
  primaryColor: string;
  secondaryColor: string;
  espnId: number; // Logo: https://a.espncdn.com/i/teamlogos/ncaa/500/{espnId}.png
}

export function getTeamLogoUrl(team: FBSTeam): string {
  return `https://a.espncdn.com/i/teamlogos/ncaa/500/${team.espnId}.png`;
}

export function getTeamByShortName(shortName: string): FBSTeam | undefined {
  return FBS_TEAMS.find((t) => t.shortName === shortName);
}

export const FBS_TEAMS: FBSTeam[] = [
  // === ACC ===
  { name: "Boston College Eagles", shortName: "BC", abbreviation: "BC", conference: "ACC", primaryColor: "#8C2232", secondaryColor: "#C4A769", espnId: 103 },
  { name: "California Golden Bears", shortName: "California", abbreviation: "CAL", conference: "ACC", primaryColor: "#003262", secondaryColor: "#FDB515", espnId: 25 },
  { name: "Clemson Tigers", shortName: "Clemson", abbreviation: "CLEM", conference: "ACC", primaryColor: "#F56600", secondaryColor: "#522D80", espnId: 228 },
  { name: "Duke Blue Devils", shortName: "Duke", abbreviation: "DUKE", conference: "ACC", primaryColor: "#003087", secondaryColor: "#FFFFFF", espnId: 150 },
  { name: "Florida State Seminoles", shortName: "Florida St", abbreviation: "FSU", conference: "ACC", primaryColor: "#782F40", secondaryColor: "#CEB888", espnId: 52 },
  { name: "Georgia Tech Yellow Jackets", shortName: "Ga Tech", abbreviation: "GT", conference: "ACC", primaryColor: "#B3A369", secondaryColor: "#003057", espnId: 59 },
  { name: "Louisville Cardinals", shortName: "Louisville", abbreviation: "LOU", conference: "ACC", primaryColor: "#AD0000", secondaryColor: "#000000", espnId: 97 },
  { name: "Miami Hurricanes", shortName: "Miami", abbreviation: "MIA", conference: "ACC", primaryColor: "#F47321", secondaryColor: "#005030", espnId: 2390 },
  { name: "North Carolina Tar Heels", shortName: "UNC", abbreviation: "UNC", conference: "ACC", primaryColor: "#7BAFD4", secondaryColor: "#FFFFFF", espnId: 153 },
  { name: "NC State Wolfpack", shortName: "NC State", abbreviation: "NCST", conference: "ACC", primaryColor: "#CC0000", secondaryColor: "#000000", espnId: 152 },
  { name: "Pittsburgh Panthers", shortName: "Pitt", abbreviation: "PITT", conference: "ACC", primaryColor: "#003594", secondaryColor: "#FFB81C", espnId: 221 },
  { name: "SMU Mustangs", shortName: "SMU", abbreviation: "SMU", conference: "ACC", primaryColor: "#CC0035", secondaryColor: "#002A5C", espnId: 2567 },
  { name: "Stanford Cardinal", shortName: "Stanford", abbreviation: "STAN", conference: "ACC", primaryColor: "#8C1515", secondaryColor: "#FFFFFF", espnId: 24 },
  { name: "Syracuse Orange", shortName: "Syracuse", abbreviation: "SYR", conference: "ACC", primaryColor: "#F76900", secondaryColor: "#002D74", espnId: 183 },
  { name: "Virginia Cavaliers", shortName: "Virginia", abbreviation: "UVA", conference: "ACC", primaryColor: "#232D4B", secondaryColor: "#F84C1E", espnId: 258 },
  { name: "Virginia Tech Hokies", shortName: "Va Tech", abbreviation: "VT", conference: "ACC", primaryColor: "#630031", secondaryColor: "#CF4420", espnId: 259 },
  { name: "Wake Forest Demon Deacons", shortName: "Wake Forest", abbreviation: "WAKE", conference: "ACC", primaryColor: "#9E7E38", secondaryColor: "#000000", espnId: 154 },

  // === Big 12 ===
  { name: "Arizona Wildcats", shortName: "Arizona", abbreviation: "ARIZ", conference: "Big 12", primaryColor: "#003366", secondaryColor: "#CC0033", espnId: 12 },
  { name: "Arizona State Sun Devils", shortName: "Arizona St", abbreviation: "ASU", conference: "Big 12", primaryColor: "#8C1D40", secondaryColor: "#FFC627", espnId: 9 },
  { name: "Baylor Bears", shortName: "Baylor", abbreviation: "BAY", conference: "Big 12", primaryColor: "#003015", secondaryColor: "#FFB81C", espnId: 239 },
  { name: "BYU Cougars", shortName: "BYU", abbreviation: "BYU", conference: "Big 12", primaryColor: "#002E5D", secondaryColor: "#FFFFFF", espnId: 252 },
  { name: "UCF Knights", shortName: "UCF", abbreviation: "UCF", conference: "Big 12", primaryColor: "#BA9B37", secondaryColor: "#000000", espnId: 2116 },
  { name: "Cincinnati Bearcats", shortName: "Cincinnati", abbreviation: "CIN", conference: "Big 12", primaryColor: "#E00122", secondaryColor: "#000000", espnId: 2132 },
  { name: "Colorado Buffaloes", shortName: "Colorado", abbreviation: "COLO", conference: "Big 12", primaryColor: "#CFB87C", secondaryColor: "#000000", espnId: 38 },
  { name: "Houston Cougars", shortName: "Houston", abbreviation: "HOU", conference: "Big 12", primaryColor: "#C8102E", secondaryColor: "#FFFFFF", espnId: 248 },
  { name: "Iowa State Cyclones", shortName: "Iowa St", abbreviation: "ISU", conference: "Big 12", primaryColor: "#C8102E", secondaryColor: "#F1BE48", espnId: 66 },
  { name: "Kansas Jayhawks", shortName: "Kansas", abbreviation: "KU", conference: "Big 12", primaryColor: "#0051BA", secondaryColor: "#E8000D", espnId: 2305 },
  { name: "Kansas State Wildcats", shortName: "Kansas St", abbreviation: "KSU", conference: "Big 12", primaryColor: "#512888", secondaryColor: "#FFFFFF", espnId: 2306 },
  { name: "Oklahoma State Cowboys", shortName: "Oklahoma St", abbreviation: "OKST", conference: "Big 12", primaryColor: "#FF6600", secondaryColor: "#000000", espnId: 197 },
  { name: "TCU Horned Frogs", shortName: "TCU", abbreviation: "TCU", conference: "Big 12", primaryColor: "#4D1979", secondaryColor: "#FFFFFF", espnId: 2628 },
  { name: "Texas Tech Red Raiders", shortName: "Texas Tech", abbreviation: "TTU", conference: "Big 12", primaryColor: "#CC0000", secondaryColor: "#000000", espnId: 2641 },
  { name: "Utah Utes", shortName: "Utah", abbreviation: "UTAH", conference: "Big 12", primaryColor: "#CC0000", secondaryColor: "#FFFFFF", espnId: 254 },
  { name: "West Virginia Mountaineers", shortName: "West Virginia", abbreviation: "WVU", conference: "Big 12", primaryColor: "#002855", secondaryColor: "#EAAA00", espnId: 277 },

  // === Big Ten ===
  { name: "Illinois Fighting Illini", shortName: "Illinois", abbreviation: "ILL", conference: "Big Ten", primaryColor: "#E84A27", secondaryColor: "#13294B", espnId: 356 },
  { name: "Indiana Hoosiers", shortName: "Indiana", abbreviation: "IND", conference: "Big Ten", primaryColor: "#990000", secondaryColor: "#FFFFFF", espnId: 84 },
  { name: "Iowa Hawkeyes", shortName: "Iowa", abbreviation: "IOWA", conference: "Big Ten", primaryColor: "#FFCD00", secondaryColor: "#000000", espnId: 2294 },
  { name: "Maryland Terrapins", shortName: "Maryland", abbreviation: "MD", conference: "Big Ten", primaryColor: "#E03A3E", secondaryColor: "#FFD520", espnId: 120 },
  { name: "Michigan Wolverines", shortName: "Michigan", abbreviation: "MICH", conference: "Big Ten", primaryColor: "#00274C", secondaryColor: "#FFCB05", espnId: 130 },
  { name: "Michigan State Spartans", shortName: "Michigan St", abbreviation: "MSU", conference: "Big Ten", primaryColor: "#18453B", secondaryColor: "#FFFFFF", espnId: 127 },
  { name: "Minnesota Golden Gophers", shortName: "Minnesota", abbreviation: "MINN", conference: "Big Ten", primaryColor: "#7A0019", secondaryColor: "#FFCC33", espnId: 135 },
  { name: "Nebraska Cornhuskers", shortName: "Nebraska", abbreviation: "NEB", conference: "Big Ten", primaryColor: "#E41C38", secondaryColor: "#FFFFFF", espnId: 158 },
  { name: "Northwestern Wildcats", shortName: "Northwestern", abbreviation: "NW", conference: "Big Ten", primaryColor: "#4E2A84", secondaryColor: "#FFFFFF", espnId: 77 },
  { name: "Ohio State Buckeyes", shortName: "Ohio State", abbreviation: "OSU", conference: "Big Ten", primaryColor: "#BB0000", secondaryColor: "#666666", espnId: 194 },
  { name: "Oregon Ducks", shortName: "Oregon", abbreviation: "ORE", conference: "Big Ten", primaryColor: "#154733", secondaryColor: "#FEE123", espnId: 2483 },
  { name: "Penn State Nittany Lions", shortName: "Penn State", abbreviation: "PSU", conference: "Big Ten", primaryColor: "#041E42", secondaryColor: "#FFFFFF", espnId: 213 },
  { name: "Purdue Boilermakers", shortName: "Purdue", abbreviation: "PUR", conference: "Big Ten", primaryColor: "#CEB888", secondaryColor: "#000000", espnId: 2509 },
  { name: "Rutgers Scarlet Knights", shortName: "Rutgers", abbreviation: "RUT", conference: "Big Ten", primaryColor: "#CC0033", secondaryColor: "#5F6A72", espnId: 164 },
  { name: "USC Trojans", shortName: "USC", abbreviation: "USC", conference: "Big Ten", primaryColor: "#990000", secondaryColor: "#FFC72C", espnId: 30 },
  { name: "UCLA Bruins", shortName: "UCLA", abbreviation: "UCLA", conference: "Big Ten", primaryColor: "#2D68C4", secondaryColor: "#F2A900", espnId: 26 },
  { name: "Washington Huskies", shortName: "Washington", abbreviation: "WASH", conference: "Big Ten", primaryColor: "#4B2E83", secondaryColor: "#E8D3A2", espnId: 264 },
  { name: "Wisconsin Badgers", shortName: "Wisconsin", abbreviation: "WIS", conference: "Big Ten", primaryColor: "#C5050C", secondaryColor: "#FFFFFF", espnId: 275 },

  // === SEC ===
  { name: "Alabama Crimson Tide", shortName: "Alabama", abbreviation: "ALA", conference: "SEC", primaryColor: "#9E1B32", secondaryColor: "#FFFFFF", espnId: 333 },
  { name: "Arkansas Razorbacks", shortName: "Arkansas", abbreviation: "ARK", conference: "SEC", primaryColor: "#9D2235", secondaryColor: "#FFFFFF", espnId: 8 },
  { name: "Auburn Tigers", shortName: "Auburn", abbreviation: "AUB", conference: "SEC", primaryColor: "#0C2340", secondaryColor: "#E87722", espnId: 2 },
  { name: "Florida Gators", shortName: "Florida", abbreviation: "FLA", conference: "SEC", primaryColor: "#0021A5", secondaryColor: "#FA4616", espnId: 57 },
  { name: "Georgia Bulldogs", shortName: "Georgia", abbreviation: "UGA", conference: "SEC", primaryColor: "#BA0C2F", secondaryColor: "#000000", espnId: 61 },
  { name: "Kentucky Wildcats", shortName: "Kentucky", abbreviation: "UK", conference: "SEC", primaryColor: "#0033A0", secondaryColor: "#FFFFFF", espnId: 96 },
  { name: "LSU Tigers", shortName: "LSU", abbreviation: "LSU", conference: "SEC", primaryColor: "#461D7C", secondaryColor: "#FDD023", espnId: 99 },
  { name: "Mississippi State Bulldogs", shortName: "Miss State", abbreviation: "MSST", conference: "SEC", primaryColor: "#660000", secondaryColor: "#FFFFFF", espnId: 344 },
  { name: "Missouri Tigers", shortName: "Missouri", abbreviation: "MIZ", conference: "SEC", primaryColor: "#F1B82D", secondaryColor: "#000000", espnId: 142 },
  { name: "Oklahoma Sooners", shortName: "Oklahoma", abbreviation: "OU", conference: "SEC", primaryColor: "#841617", secondaryColor: "#FFFFFF", espnId: 201 },
  { name: "Ole Miss Rebels", shortName: "Ole Miss", abbreviation: "MISS", conference: "SEC", primaryColor: "#CE1126", secondaryColor: "#14213D", espnId: 145 },
  { name: "South Carolina Gamecocks", shortName: "South Carolina", abbreviation: "SC", conference: "SEC", primaryColor: "#73000A", secondaryColor: "#000000", espnId: 2579 },
  { name: "Tennessee Volunteers", shortName: "Tennessee", abbreviation: "TENN", conference: "SEC", primaryColor: "#FF8200", secondaryColor: "#FFFFFF", espnId: 2633 },
  { name: "Texas Longhorns", shortName: "Texas", abbreviation: "TEX", conference: "SEC", primaryColor: "#BF5700", secondaryColor: "#FFFFFF", espnId: 251 },
  { name: "Texas A&M Aggies", shortName: "Texas A&M", abbreviation: "TAMU", conference: "SEC", primaryColor: "#500000", secondaryColor: "#FFFFFF", espnId: 245 },
  { name: "Vanderbilt Commodores", shortName: "Vanderbilt", abbreviation: "VAN", conference: "SEC", primaryColor: "#866D4B", secondaryColor: "#000000", espnId: 238 },

  // === AAC ===
  { name: "Army Black Knights", shortName: "Army", abbreviation: "ARMY", conference: "AAC", primaryColor: "#000000", secondaryColor: "#D4BF91", espnId: 349 },
  { name: "Charlotte 49ers", shortName: "Charlotte", abbreviation: "CHAR", conference: "AAC", primaryColor: "#005035", secondaryColor: "#A49665", espnId: 2429 },
  { name: "East Carolina Pirates", shortName: "East Carolina", abbreviation: "ECU", conference: "AAC", primaryColor: "#592A8A", secondaryColor: "#FDC82F", espnId: 151 },
  { name: "FAU Owls", shortName: "FAU", abbreviation: "FAU", conference: "AAC", primaryColor: "#003366", secondaryColor: "#CC0000", espnId: 2226 },
  { name: "Memphis Tigers", shortName: "Memphis", abbreviation: "MEM", conference: "AAC", primaryColor: "#003087", secondaryColor: "#898D8D", espnId: 235 },
  { name: "Navy Midshipmen", shortName: "Navy", abbreviation: "NAVY", conference: "AAC", primaryColor: "#00205B", secondaryColor: "#C5B783", espnId: 2426 },
  { name: "North Texas Mean Green", shortName: "North Texas", abbreviation: "UNT", conference: "AAC", primaryColor: "#00853E", secondaryColor: "#FFFFFF", espnId: 249 },
  { name: "Rice Owls", shortName: "Rice", abbreviation: "RICE", conference: "AAC", primaryColor: "#002469", secondaryColor: "#5E6062", espnId: 242 },
  { name: "South Florida Bulls", shortName: "USF", abbreviation: "USF", conference: "AAC", primaryColor: "#006747", secondaryColor: "#CFC493", espnId: 58 },
  { name: "Temple Owls", shortName: "Temple", abbreviation: "TEM", conference: "AAC", primaryColor: "#9D2235", secondaryColor: "#FFFFFF", espnId: 218 },
  { name: "Tulane Green Wave", shortName: "Tulane", abbreviation: "TUL", conference: "AAC", primaryColor: "#006747", secondaryColor: "#87CEEB", espnId: 2655 },
  { name: "Tulsa Golden Hurricane", shortName: "Tulsa", abbreviation: "TLSA", conference: "AAC", primaryColor: "#002D62", secondaryColor: "#C8102E", espnId: 202 },
  { name: "UAB Blazers", shortName: "UAB", abbreviation: "UAB", conference: "AAC", primaryColor: "#1E6B52", secondaryColor: "#FFD200", espnId: 5 },
  { name: "UTSA Roadrunners", shortName: "UTSA", abbreviation: "UTSA", conference: "AAC", primaryColor: "#0C2340", secondaryColor: "#F47321", espnId: 2636 },

  // === Conference USA ===
  { name: "Delaware Fightin' Blue Hens", shortName: "Delaware", abbreviation: "DEL", conference: "C-USA", primaryColor: "#00539F", secondaryColor: "#FFD200", espnId: 48 },
  { name: "FIU Panthers", shortName: "FIU", abbreviation: "FIU", conference: "C-USA", primaryColor: "#081E3F", secondaryColor: "#B6862C", espnId: 2229 },
  { name: "Jacksonville State Gamecocks", shortName: "Jax State", abbreviation: "JVST", conference: "C-USA", primaryColor: "#CC0000", secondaryColor: "#FFFFFF", espnId: 55 },
  { name: "Kennesaw State Owls", shortName: "Kennesaw St", abbreviation: "KENN", conference: "C-USA", primaryColor: "#FDBB30", secondaryColor: "#000000", espnId: 338 },
  { name: "Liberty Flames", shortName: "Liberty", abbreviation: "LIB", conference: "C-USA", primaryColor: "#002D62", secondaryColor: "#C41230", espnId: 2335 },
  { name: "Louisiana Tech Bulldogs", shortName: "La Tech", abbreviation: "LT", conference: "C-USA", primaryColor: "#002F8B", secondaryColor: "#CF0A2C", espnId: 2348 },
  { name: "Middle Tennessee Blue Raiders", shortName: "Middle Tenn", abbreviation: "MTSU", conference: "C-USA", primaryColor: "#0066CC", secondaryColor: "#FFFFFF", espnId: 2393 },
  { name: "Missouri State Bears", shortName: "Missouri St", abbreviation: "MOST", conference: "C-USA", primaryColor: "#6F263D", secondaryColor: "#FFFFFF", espnId: 2623 },
  { name: "New Mexico State Aggies", shortName: "New Mexico St", abbreviation: "NMSU", conference: "C-USA", primaryColor: "#8B0000", secondaryColor: "#FFFFFF", espnId: 166 },
  { name: "Sam Houston Bearkats", shortName: "Sam Houston", abbreviation: "SHSU", conference: "C-USA", primaryColor: "#F58025", secondaryColor: "#FFFFFF", espnId: 2534 },
  { name: "UTEP Miners", shortName: "UTEP", abbreviation: "UTEP", conference: "C-USA", primaryColor: "#FF8200", secondaryColor: "#041E42", espnId: 2638 },
  { name: "Western Kentucky Hilltoppers", shortName: "WKU", abbreviation: "WKU", conference: "C-USA", primaryColor: "#B01E24", secondaryColor: "#FFFFFF", espnId: 98 },

  // === MAC ===
  { name: "Akron Zips", shortName: "Akron", abbreviation: "AKR", conference: "MAC", primaryColor: "#041E42", secondaryColor: "#A89968", espnId: 2006 },
  { name: "Ball State Cardinals", shortName: "Ball State", abbreviation: "BALL", conference: "MAC", primaryColor: "#BA0C2F", secondaryColor: "#FFFFFF", espnId: 2050 },
  { name: "Bowling Green Falcons", shortName: "Bowling Green", abbreviation: "BGSU", conference: "MAC", primaryColor: "#4F2C1D", secondaryColor: "#FF7300", espnId: 189 },
  { name: "Buffalo Bulls", shortName: "Buffalo", abbreviation: "BUFF", conference: "MAC", primaryColor: "#005BBB", secondaryColor: "#FFFFFF", espnId: 2084 },
  { name: "Central Michigan Chippewas", shortName: "Central Mich", abbreviation: "CMU", conference: "MAC", primaryColor: "#6A0032", secondaryColor: "#FFC82E", espnId: 2117 },
  { name: "Eastern Michigan Eagles", shortName: "Eastern Mich", abbreviation: "EMU", conference: "MAC", primaryColor: "#006633", secondaryColor: "#FFFFFF", espnId: 2199 },
  { name: "Kent State Golden Flashes", shortName: "Kent State", abbreviation: "KENT", conference: "MAC", primaryColor: "#002664", secondaryColor: "#EAAB00", espnId: 2309 },
  { name: "UMass Minutemen", shortName: "UMass", abbreviation: "MASS", conference: "MAC", primaryColor: "#881C1C", secondaryColor: "#FFFFFF", espnId: 113 },
  { name: "Miami (OH) RedHawks", shortName: "Miami (OH)", abbreviation: "M-OH", conference: "MAC", primaryColor: "#B61E2E", secondaryColor: "#FFFFFF", espnId: 193 },
  { name: "Northern Illinois Huskies", shortName: "N Illinois", abbreviation: "NIU", conference: "MAC", primaryColor: "#BA0C2F", secondaryColor: "#000000", espnId: 2459 },
  { name: "Ohio Bobcats", shortName: "Ohio", abbreviation: "OHIO", conference: "MAC", primaryColor: "#00694E", secondaryColor: "#FFFFFF", espnId: 195 },
  { name: "Toledo Rockets", shortName: "Toledo", abbreviation: "TOL", conference: "MAC", primaryColor: "#003C71", secondaryColor: "#FFB300", espnId: 2649 },
  { name: "Western Michigan Broncos", shortName: "Western Mich", abbreviation: "WMU", conference: "MAC", primaryColor: "#6C4023", secondaryColor: "#B5A167", espnId: 2711 },

  // === Mountain West ===
  { name: "Air Force Falcons", shortName: "Air Force", abbreviation: "AFA", conference: "MWC", primaryColor: "#003087", secondaryColor: "#8A8D8F", espnId: 2005 },
  { name: "Boise State Broncos", shortName: "Boise State", abbreviation: "BSU", conference: "MWC", primaryColor: "#0033A0", secondaryColor: "#D64309", espnId: 68 },
  { name: "Colorado State Rams", shortName: "Colorado St", abbreviation: "CSU", conference: "MWC", primaryColor: "#1E4D2B", secondaryColor: "#C8C372", espnId: 36 },
  { name: "Fresno State Bulldogs", shortName: "Fresno St", abbreviation: "FRES", conference: "MWC", primaryColor: "#DB0032", secondaryColor: "#002F6C", espnId: 278 },
  { name: "Hawai'i Rainbow Warriors", shortName: "Hawai'i", abbreviation: "HAW", conference: "MWC", primaryColor: "#024731", secondaryColor: "#FFFFFF", espnId: 62 },
  { name: "Nevada Wolf Pack", shortName: "Nevada", abbreviation: "NEV", conference: "MWC", primaryColor: "#003366", secondaryColor: "#8E9093", espnId: 2440 },
  { name: "New Mexico Lobos", shortName: "New Mexico", abbreviation: "UNM", conference: "MWC", primaryColor: "#BA0C2F", secondaryColor: "#63666A", espnId: 167 },
  { name: "San Diego State Aztecs", shortName: "San Diego St", abbreviation: "SDSU", conference: "MWC", primaryColor: "#A6192E", secondaryColor: "#000000", espnId: 21 },
  { name: "San Jose State Spartans", shortName: "San Jose St", abbreviation: "SJSU", conference: "MWC", primaryColor: "#0055A2", secondaryColor: "#E5A823", espnId: 23 },
  { name: "UNLV Rebels", shortName: "UNLV", abbreviation: "UNLV", conference: "MWC", primaryColor: "#CF0A2C", secondaryColor: "#000000", espnId: 2439 },
  { name: "Utah State Aggies", shortName: "Utah State", abbreviation: "USU", conference: "MWC", primaryColor: "#0F2439", secondaryColor: "#FFFFFF", espnId: 328 },
  { name: "Wyoming Cowboys", shortName: "Wyoming", abbreviation: "WYO", conference: "MWC", primaryColor: "#492F24", secondaryColor: "#FFC425", espnId: 2704 },

  // === Sun Belt ===
  { name: "Appalachian State Mountaineers", shortName: "App State", abbreviation: "APP", conference: "Sun Belt", primaryColor: "#000000", secondaryColor: "#FFCC00", espnId: 2026 },
  { name: "Arkansas State Red Wolves", shortName: "Arkansas St", abbreviation: "ARST", conference: "Sun Belt", primaryColor: "#CC092F", secondaryColor: "#000000", espnId: 2032 },
  { name: "Coastal Carolina Chanticleers", shortName: "Coastal Car", abbreviation: "CCU", conference: "Sun Belt", primaryColor: "#006F71", secondaryColor: "#A27752", espnId: 324 },
  { name: "Georgia Southern Eagles", shortName: "Ga Southern", abbreviation: "GASO", conference: "Sun Belt", primaryColor: "#011E41", secondaryColor: "#87714D", espnId: 290 },
  { name: "Georgia State Panthers", shortName: "Georgia St", abbreviation: "GAST", conference: "Sun Belt", primaryColor: "#0039A6", secondaryColor: "#CC0000", espnId: 2247 },
  { name: "James Madison Dukes", shortName: "James Madison", abbreviation: "JMU", conference: "Sun Belt", primaryColor: "#450084", secondaryColor: "#CBB677", espnId: 256 },
  { name: "Louisiana Ragin' Cajuns", shortName: "Louisiana", abbreviation: "ULL", conference: "Sun Belt", primaryColor: "#CE181E", secondaryColor: "#0A0A0A", espnId: 309 },
  { name: "Marshall Thundering Herd", shortName: "Marshall", abbreviation: "MRSH", conference: "Sun Belt", primaryColor: "#00B140", secondaryColor: "#FFFFFF", espnId: 276 },
  { name: "Old Dominion Monarchs", shortName: "Old Dominion", abbreviation: "ODU", conference: "Sun Belt", primaryColor: "#003057", secondaryColor: "#7C878E", espnId: 295 },
  { name: "South Alabama Jaguars", shortName: "South Alabama", abbreviation: "USA", conference: "Sun Belt", primaryColor: "#00205B", secondaryColor: "#BF0D3E", espnId: 6 },
  { name: "Southern Miss Golden Eagles", shortName: "Southern Miss", abbreviation: "USM", conference: "Sun Belt", primaryColor: "#000000", secondaryColor: "#FFB300", espnId: 2572 },
  { name: "Texas State Bobcats", shortName: "Texas State", abbreviation: "TXST", conference: "Sun Belt", primaryColor: "#501214", secondaryColor: "#8D734A", espnId: 326 },
  { name: "Troy Trojans", shortName: "Troy", abbreviation: "TROY", conference: "Sun Belt", primaryColor: "#8B2332", secondaryColor: "#000000", espnId: 2653 },
  { name: "UL Monroe Warhawks", shortName: "UL Monroe", abbreviation: "ULM", conference: "Sun Belt", primaryColor: "#840029", secondaryColor: "#FFB300", espnId: 2433 },

  // === Pac-12 ===
  { name: "Oregon State Beavers", shortName: "Oregon St", abbreviation: "ORST", conference: "Pac-12", primaryColor: "#DC4405", secondaryColor: "#000000", espnId: 204 },
  { name: "Washington State Cougars", shortName: "Washington St", abbreviation: "WSU", conference: "Pac-12", primaryColor: "#981E32", secondaryColor: "#5E6A71", espnId: 265 },

  // === Independents ===
  { name: "Notre Dame Fighting Irish", shortName: "Notre Dame", abbreviation: "ND", conference: "Ind", primaryColor: "#0C2340", secondaryColor: "#C99700", espnId: 87 },
  { name: "UConn Huskies", shortName: "UConn", abbreviation: "CONN", conference: "Ind", primaryColor: "#002868", secondaryColor: "#FFFFFF", espnId: 41 },

  // === FCS opponents (added for cross-division pick'em matchups) ===
  { name: "Indiana State Sycamores", shortName: "Indiana St", abbreviation: "INST", conference: "FCS", primaryColor: "#0033A0", secondaryColor: "#FFFFFF", espnId: 282 },
];
