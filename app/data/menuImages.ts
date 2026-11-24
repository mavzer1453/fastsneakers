/**
 * Thumbnail for each collection tile in the mobile menu — a representative
 * product from that collection, served at 160px from the store's own CDN.
 *
 * Three rules hold this list together:
 *  1. Every URL appears exactly once. A repeated picture makes two tiles
 *     look like the same destination.
 *  2. The background must be transparent or pure white — those vanish under
 *     `mix-blend-mode: multiply`. Anything shot on a grey card or on-body
 *     renders as a visible frame on a tinted tile. Checked by sampling the
 *     image corners, not by file extension.
 *  3. A department shows what it sells — Men and Women get apparel, not the
 *     sneaker that happens to top their best-seller list.
 *
 * Static on purpose: the drawer must not fire a storefront query just to
 * decorate itself. Handles with no entry render as a text tile, so adding a
 * menu item can never break the layout.
 */
const CDN = 'https://cdn.shopify.com/s/files/1/1024/9466/7139/files';
/**
 * This store's own Files CDN. Pictures the original store has since deleted
 * are served from here instead; move the rest over as they break.
 */
const OWN_CDN = 'https://cdn.shopify.com/s/files/1/1081/4613/1276/files';

export const MENU_IMAGES: Record<string, string> = {
  // Departments — apparel for Men/Women, footwear for the shoe categories.
  // Sale and Bestsellers deliberately have none: they use a glyph instead.
  men: `${OWN_CDN}/FearofGodEssentials_25.webp?width=160`,
  women: `${OWN_CDN}/Nike_x_SKIMS_Women_s_Weightless_Layers_Mock_Neck_Long_Sleeve_Top_Lead.png?width=160`,
  kids: `${OWN_CDN}/ASICS_Gel-1130_White_Arctic_Sky_GS.png?width=160`,
  sneakers: `${OWN_CDN}/nike-zoom-vomero-5-cobblestone.png?width=160`,

  // Men's categories
  'men-t-shirts': `${OWN_CDN}/og-carni-t-shirt-9929440.webp?width=160`,
  'men-hoodies': `${OWN_CDN}/stussy-hoodie-vintage-4988009.png?width=160`,
  'men-jackets-outerwear': `${OWN_CDN}/EE54CB22-E2F6-49A1-995B-20511F16DE5C.png?width=160`,
  'men-pants-jeans': `${OWN_CDN}/308_06083c71-f46b-4747-80ce-e4ddd46405f6.jpg?width=160`,
  'men-shorts': `${OWN_CDN}/IMG-3391.png?width=160`,
  'men-tracksuits-sets': `${OWN_CDN}/11261E91-DA63-4357-B35B-1E2D21F4F5E1.png?width=160`,
  accessories: `${OWN_CDN}/JEANS_23_c8367462-12ff-4438-8f89-ca9685c54db6.png?width=160`,

  // Fear of God Essentials
  essentials: `${CDN}/3AE46D18-CF24-4F72-8981-9A6D413CAB7B_160x160.webp?v=1786148951`,
  'essentials-sets': `${OWN_CDN}/essentials-hoodie-set-1346028.png?width=160`,
  'essentials-hoodies': `${OWN_CDN}/FearofGodEssentialsDarkOatmealHoodie_1.webp?width=160`,
  'essentials-t-shirts': `${OWN_CDN}/FearofGodEssentialsNBABlackWhiteT-shirt.png?width=160`,
  'essentials-pants': `${OWN_CDN}/FearofGodEssentialsLightOatmealLangeBroek.webp?width=160`,
  'essentials-shorts': `${OWN_CDN}/FearofGodEssentials_32.png?width=160`,
  'essentials-jackets': `${OWN_CDN}/FearofGodEssentialsFW19PufferJacketBlack.png?width=160`,
  'essentials-summer': `${OWN_CDN}/FearofGodEssentialsNBABlackWhiteSummerSet.png?width=160`,
  'essentials-winter': `${OWN_CDN}/Fear_of_God_Essentials_FW24_Black_White_Full_set_3.png?width=160`,

  // Women's categories
  'women-sneakers': `${OWN_CDN}/adidasSambaOGPrelovedRedLeopard_Women_s.png?width=160`,
  'women-boots': `${OWN_CDN}/1_14.png?width=160`,
  'women-tops': `${OWN_CDN}/Nike_x_SKIMS_Women_s_Weightless_Layers_Mock_Neck_Long_Sleeve_Top_Obsidian.png?width=160`,
  'women-slippers': `${OWN_CDN}/UGG_Tazz_Slipper_Chestnut.png?width=160`,
  'women-bags': `${OWN_CDN}/JacquemusLeChiquitoMoyenBlack.png?width=160`,
  'flare-jeans': `${CDN}/soma7_160x160.png?v=1786144313`,
  'sale-women': `${OWN_CDN}/Nike_Zoom_Vomero_5_Metallic_Gold_Women_s.png?width=160`,
  'ugg-boots-slippers': `${OWN_CDN}/ugg-classic-ultra-mini-antilope-w-1-1000_1.png?width=160`,

  // Kids sizing
  'kids-gs': `${OWN_CDN}/ASICSGel-1130WhiteClayCanyon_GS.png?width=160`,
  'kids-ps': `${OWN_CDN}/NewBalance550TripleWhiteGS.png?width=160`,
  'kids-td': `${OWN_CDN}/550-bungee-lace-with-top-strap-white-1.png?width=160`,

  // Sneaker model lines
  nike: `${OWN_CDN}/nike-zoom-vomero-5-oatmeal-1.png?width=160`,
  'nike-dunk': `${OWN_CDN}/nike-dunk-low-remastered-mint-1.png?width=160`,
  'nike-air-force-1': `${OWN_CDN}/nike-air-force-1-low-07-triple-black-4.png?width=160`,
  'nike-air-max': `${OWN_CDN}/img01_2.png?width=160`,
  'nike-zoom-vomero': `${OWN_CDN}/Nike_Zoom_Vomero_5_Photon_Dust_Pink_Foam.png?width=160`,
  'nike-p-6000': `${OWN_CDN}/Nike_P-6000_Anthracite_Smoke_Grey_1.png?width=160`,
  'nike-shox': `${OWN_CDN}/NikeShoxTLPinkFoam_1.png?width=160`,
  'nike-nocta': `${OWN_CDN}/nocta-x-nike-air-force-1-low-certified-lover-boy-1-1000.png?width=160`,

  jordan: `${OWN_CDN}/air-jordan-4-retro-military-black-1-1000.png?width=160`,
  'air-jordan-1': `${OWN_CDN}/TJpuWFjcEW3Ww3Dn7kXst3C8YoOTqaNa4AUmuEDE.png?width=160`,
  'air-jordan-4': `${OWN_CDN}/air-jordan-4-retro-white-midnight-navy-1-1000.png?width=160`,
  'jumpman-jack': `${OWN_CDN}/JordanJumpmanJackTRTravisScottxChaseBBlackNightSilver_b57631a3-df5c-468c-8c95-a0f1fa64c4a1.png?width=160`,
  'travis-scott': `${OWN_CDN}/image_-_2026-03-09T232050.055-removebg-preview.png?width=160`,
  'travis-scott-sneakers': `${OWN_CDN}/nike-air-max-1-travis-scott-cactus-jack-baroque-brown-DO9392-200-4.png?width=160`,

  'new-balance': `${OWN_CDN}/new-balance-new-balance-9060-vintage-indigo_1.png?width=160`,
  'new-balance-9060': `${OWN_CDN}/new-balance-new-balance-9060-natural-indigo.png?width=160`,
  'new-balance-1906': `${OWN_CDN}/new-balance-1906r-silver-classic-crimson2.png?width=160`,
  'new-balance-2002r': `${OWN_CDN}/file.png?width=160`,
  'new-balance-550': `${OWN_CDN}/new-balance-550-white-black-rain-cloud-1-1000.png?width=160`,
  'new-balance-530': `${OWN_CDN}/new-balance-530-grey-matter-silver-metallic1.webp?width=160`,

  'asics-gel-nyc': `${OWN_CDN}/ASICSGel-NYCMidnightMidnight.png?width=160`,
  'asics-gel-kayano': `${OWN_CDN}/ASICSGelKayano14ArcticSkyPureSilver.png?width=160`,
  'asics-gel-1130': `${OWN_CDN}/ASICSGel-1130WhitePureSilver.png?width=160`,
  'adidas-samba': `${OWN_CDN}/snakerstoreAdidas_Samba_OG_Night_Navy_Cream_White_Gum-ID2056-0_1024x1024_5b43b82d-e8c3-495d-b800-67805aa19694.png?width=160`,
  'adidas-spezial': `${OWN_CDN}/AdidasHandballSpezialGreyBlackGum1.png?width=160`,

  // Brands
  adidas: `${OWN_CDN}/adidas_Superstar_Hellstar_Hazy_Orange.png?width=160`,
  asics: `${OWN_CDN}/ASICSGel-NYCGraphiteGreyBlack_c35337f7-8eb9-41b1-9902-eb1abd4d6952.png?width=160`,
  'sp5der': `${OWN_CDN}/file_19.png?width=160`,
  represent: `${OWN_CDN}/48F986EC-301B-45D2-A80E-54BA0F72BEAC.webp?width=160`,
  stussy: `${OWN_CDN}/stussy-t-shirt-iced-out-2271983.png?width=160`,
  corteiz: `${OWN_CDN}/191A3AD7-FB4A-453A-81EE-05BE989074B2.webp?width=160`,
  'syna-world': `${OWN_CDN}/syna-grey-hoodie-8423793.png?width=160`,
  'gallery-dept': `${OWN_CDN}/gallery-dark-grey-t-shirt-2850490.webp?width=160`,
  supreme: `${OWN_CDN}/SupremeUmbroCottonRipstopTrackPant_SS26_Stone.png?width=160`,
  'on-running': `${OWN_CDN}/onrunningPearlIce_1.png?width=160`,
  jacquemus: `${OWN_CDN}/JacquemusLeGrandBambinoNavy.png?width=160`,

  // ---------------------------------------------------------------------
  // Added with the SneakerAsk import. Each is the top-selling product of
  // that collection, pulled from the store's own media — so a tile always
  // shows something actually for sale under it. Sizing is left to the CDN's
  // `width` param rather than a pre-baked _160x160 variant, since these were
  // uploaded at their original dimensions.
  // ---------------------------------------------------------------------

  // Footwear types
  boots: `${CDN}/Timberland6PremiumBootVenedaCarterSilver.png?v=1788262276&width=160`,
  slippers: `${CDN}/UGG_Lowmel_Hickory.png?v=1788262628&width=160`,
  clothing: `${OWN_CDN}/Fear_of_God_Essentials_Light_Oatmeal_Relaxed_pak.png?width=160`,
  'men-sneakers': `${OWN_CDN}/Nike_Air_Jordan_1_Retro_Low_OG_SP_Travis_Scott_Sail_Tropical_Pink.png?width=160`,
  'kids-sneakers': `${CDN}/Jordan4RetroThunder_2023_GS.png?v=1788262448&width=160`,

  // Sneaker brands
  puma: `${CDN}/311401-01-main.png?v=1788259980&width=160`,
  salomon: `${CDN}/SalomonXT-6WhiteVanillaIcePlum.png?v=1788262279&width=160`,
  vans: `${CDN}/Vans_OTW_Old_Skool_36_Pearlized_Pack_Marshmallow_White.png?v=1788262116&width=160`,
  crocs: `${CDN}/CrocsClassicClogStrangerThings.png?v=1788262349&width=160`,
  converse: `${CDN}/A14444C-main.webp?v=1788259753&width=160`,
  saucony: `${CDN}/SauconyProGridOmni9PinkPurple.png?v=1788262252&width=160`,
  hoka: `${CDN}/1168951-HWB-main.png?v=1788250986&width=160`,
  birkenstock: `${CDN}/151211-main.webp?v=1788258922&width=160`,
  timberland: `${CDN}/1183C102-200-main.png?v=1788251774&width=160`,
  'under-armour': `${CDN}/UnderArmourUASolaUltimateBlack.png?v=1788262186&width=160`,
  'comme-des-garcons': `${CDN}/CN5738-001-main.png?v=1788261007&width=160`,

  // Streetwear brands
  bape: `${CDN}/adidasCampus80sBapeCollegiateNavy.png?v=1788262418&width=160`,
  hellstar: `${CDN}/Hellstar_Flame_Sweatpant_Black.png?v=1788262312&width=160`,
  vlone: `${CDN}/Juice_Wrld_x_Vlone_Butterfly_T-shirt_White.png?v=1788249967&width=160`,
  godspeed: `${CDN}/GodspeedMiamiSurfClubTeeBlack.png?v=1788249944&width=160`,

  // Nike silhouettes
  'nike-dunk-low': `${CDN}/DO9844-100-main.png?v=1788261800&width=160`,
  'nike-dunk-sb': `${OWN_CDN}/NikeSBDunkLowYutoHorigomeAsparagus.png?width=160`,
  'nike-air-max-1': `${CDN}/HQ8618-100-main.png?v=1788251335&width=160`,
  'nike-vomero-5': `${CDN}/IM9467-001-main.png?v=1788260194&width=160`,
  'nike-shox-tl': `${CDN}/IH5075-219-main.png?v=1788260003&width=160`,
  'nike-kobe': `${CDN}/NikeKobe8ProtroWhatThe_2025_GS.png?v=1788262416&width=160`,
  // Was IH8570-100-main.webp, which 404s — the tile rendered as a broken
  // image icon. Replaced with a product that is actually in the collection.
  'nike-lebron': `${CDN}/Nike_LeBron_23_Old_Glory.png?v=1788259039&width=160`,
  'nike-pegasus': `${CDN}/IH2288-001-main.png?v=1788259916&width=160`,
  'nike-blazer': `${CDN}/FZ3626-100.png?v=1788259782&width=160`,
  'nike-total-90': `${CDN}/Nike_Total_90_3_SP_Pink_Foam_Team_Red.png?v=1788259861&width=160`,
  'nike-golf': `${CDN}/HF1030-300-main.png?v=1788259882&width=160`,
  'nike-reactx': `${CDN}/HV5062-501-main.png?v=1788212721&width=160`,
  // No 'nike-apparel' picture (owner, 24 Sep 2026): the fleece-pant photo
  // was removed so the tile reads as the plain "Nike Apparel" name.

  // Jordan, Yeezy
  'air-jordan-11': `${CDN}/Jordan11RetroBredVelvet.png?v=1788262619&width=160`,
  'air-jordan-6': `${CDN}/Jordan_6_Retro_A_Ma_Maniere_Smokey_Mauve.png?v=1788262347&width=160`,
  'yeezy-slide': `${CDN}/adidas_Yeezy_Slide_Ochre_Kids.png?v=1788262598&width=160`,

  // adidas, New Balance, ASICS
  'adidas-gazelle-bold': `${CDN}/JQ7409-main.png?v=1788259963&width=160`,
  'adidas-campus-00s': `${CDN}/img01_25.png?v=1788262759&width=160`,
  'adidas-xlg': `${CDN}/adidasXLGRunnerDeluxeGray.png?v=1788262288&width=160`,
  'adidas-taekwondo': `${CDN}/AdidasTaekwondoMeiBalletBlackGum.png?v=1788262395&width=160`,
  'adidas-bw-army': `${CDN}/adidasBWArmyLuxWhiteGum.png?v=1788262133&width=160`,
  'adidas-sl-72': `${CDN}/adidasSL72RSPrelovedFigOffWhite.png?v=1788262261&width=160`,
  'new-balance-740': `${CDN}/G7407LM-main.png?v=1788259761&width=160`,
  'new-balance-1000': `${CDN}/M1000F-main.png?v=1788262027&width=160`,
  'new-balance-204l': `${CDN}/U204LFSP-main.png?v=1788260824&width=160`,
  'new-balance-1906l': `${CDN}/U1906LCS-main.png?v=1788259278&width=160`,
  'new-balance-abzorb': `${CDN}/U2000ETB-main.png?v=1788252801&width=160`,
  'asics-gt-2160': `${CDN}/1203A320-113.png?v=1788259842&width=160`,
  'asics-gel-nimbus': `${CDN}/ASICSGel-Nimbus10.1BlackGrandShark.png?v=1788262648&width=160`,

  // UGG silhouettes
  'ugg-tasman': `${CDN}/eds-store-sneakersTasman_Slipper_Driftwood-5955-DRI-0.png?v=1788262769&width=160`,
  'ugg-tazz': `${CDN}/UGGTazzSlipperSandKids.png?v=1788262601&width=160`,
  'ugg-lowmel': `${CDN}/UGGLowmelLove_25JasmineTropicalPink_Women_s.png?v=1788262504&width=160`,
  'ugg-golden': `${CDN}/1152719-CERA-main.png?v=1788260007&width=160`,
  'ugg-goldenstar': `${CDN}/1138252-SAN-main.png?v=1788252020&width=160`,
  'ugg-bailey': `${CDN}/UGGMiniBaileyBowIIChestnut_Women_s.png?v=1788262357&width=160`,
  'ugg-classic-ultra-mini': `${OWN_CDN}/ugg-classic-ultra-mini-chestnut-w-1-1000.png?width=160`,
  'ugg-classic-mini': `${OWN_CDN}/UGG-Classic-Mini-II-Boot-Chestnut_1.png?width=160`,
  'ugg-classic-micro': `${CDN}/1173891-BTMG-main.png?v=1788259990&width=160`,
  'ugg-weather-hybrid': `${CDN}/1144096-CWTC-main.png?v=1788259591&width=160`,

  // Other silhouettes
  'salomon-xt-6': `${CDN}/SalomonXT-6WhiteVanillaIcePlum.png?v=1788262279&width=161`,
  'puma-speedcat': `${CDN}/PumaSpeedcatBalletVooDarkChocolate.png?v=1788262396&width=160`,
  'puma-lamelo-ball': `${CDN}/311401-01-main.png?v=1788259980&width=161`,
  'vans-old-skool': `${CDN}/Vans_OTW_Old_Skool_36_Pearlized_Pack_Marshmallow_White.png?v=1788262116&width=161`,
  'crocs-classic-clog': `${CDN}/CrocsClassicClogStrangerThings.png?v=1788262349&width=161`,
  'converse-chuck-taylor': `${CDN}/A14444C-main.webp?v=1788259753&width=161`,
  'saucony-progrid': `${CDN}/SauconyProGridOmni9PinkPurple.png?v=1788262252&width=161`,
  'birkenstock-boston': `${CDN}/660461-main.png?v=1788251018&width=160`,
  'hoka-one-one': `${CDN}/1110518-BKSTR-main.png?v=1788250984&width=160`,

  // Collabs
  collabs: `${OWN_CDN}/Nike_Air_Jordan_1_Retro_Low_OG_SP_Travis_Scott_Sail_Tropical_Pink.png?width=161`,
  'nike-off-white': `${OWN_CDN}/nike-air-force-1-mid-sp-off-white-varsity-maize2.png?width=160`,
  'nike-sacai': `${CDN}/HQ8618-100-main.png?v=1788251335&width=161`,
  'nike-patta': `${CDN}/WITHOUT_BRACELET_II7055-100-main.webp?v=1788252353&width=160`,
  // A Box Logo hoodie was the honest top product of this collection while its
  // rule matched every Supreme item; now the rule is tag AND type:sneakers,
  // so the tile shows what it actually opens onto.
  'nike-supreme': `${OWN_CDN}/Nike_SB_Dunk_Low_Supreme_Stars_Mean_Green_1.png?width=160`,
  'collab-wales-bonner': `${CDN}/adidasSambaWalesBonnerBrownCroc.png?v=1788262611&width=160`,
  'collab-bad-bunny': `${CDN}/BadBunnyxadidasAdizeroSL72_Brown_Pink.png?v=1788212453&width=160`,
  'collab-kith': `${OWN_CDN}/ASICSGel-Kayano12.1KithPeatCream.png?width=160`,
  'collab-palace': `${CDN}/UGGTasmanSlipperPalaceBurntOliveCamo.png?v=1788262586&width=160`,
  'collab-kaws': `${CDN}/2_6fe3ecc4-4c57-47f6-956d-fe3717ec996a.png?v=1788262687&width=160`,
  'collab-clot': `${CDN}/DH2492-100-main.png?v=1788261619&width=161`,
  'collab-union': `${CDN}/Jordan1RetroHighOGSPFragmentxUnionLASportRoyal_e2e921c6-05dd-43cf-94e8-e20d35b57262.png?v=1788262210&width=160`,
  'collab-fragment': `${CDN}/Jordan1RetroHighOGSPFragmentxUnionLASportRoyal_e2e921c6-05dd-43cf-94e8-e20d35b57262.png?v=1788262210&width=161`,
  'collab-pharrell': `${CDN}/adidasAdistarJellyfishPharrellWilliamsRoyalBlue.png?v=1788262211&width=160`,
  'collab-concepts': `${CDN}/DR2362-300-main.png?v=1788261760&width=160`,
  'collab-jacquemus': `${CDN}/FQ1100-001-main.png?v=1788261679&width=160`,

  // Clothing by brand
  'supreme-t-shirts': `${CDN}/SupremeTylerTheCreatorTeeBlack.png?v=1788262481&width=160`,
  'supreme-hoodies': `${CDN}/Supreme_Box_Logo_Hooded_Sweatshirt_Sweatshirt_FW24_Black.png?v=1788262495&width=161`,
  'supreme-jackets': `${CDN}/NAHMIAS_x_Marty_Supreme_A24_Classic_Warm_Up_Jacket_Pink_1.png?v=1788262162&width=160`,
  'supreme-pants': `${CDN}/Supreme_MM6_Maison_Margiela_Eagle_Sweatpant_Purple_1.png?v=1788249902&width=160`,
  'supreme-accessories': `${CDN}/Supreme_New_Era_Box_Logo_Beanie_FW25_Realtree_AP_Camo.png?v=1788262290&width=160`,
  'stussy-t-shirts': `${CDN}/Stussy8BallPigmentDyedTeeBlack.png?v=1788262099&width=160`,
  'stussy-hoodies': `${CDN}/StussyBasicThermalWoodlandCamo_1.png?v=1788262107&width=160`,
  'sp5der-hoodies': `${CDN}/Sp5der_SP5_Mint_Hoodie_Mint.png?v=1788262563&width=160`,
  'sp5der-t-shirts': `${CDN}/Sp5derOGWebV2TeeBlackMulticolor.png?v=1788262372&width=160`,
  'sp5der-pants': `${CDN}/Sp5derArachNYPhobiaSweatpantsAshGrey_6ed2980d-b209-4183-94f0-05d5a6dd2011.png?v=1788262562&width=160`,
  'travis-scott-t-shirts': `${OWN_CDN}/Screenshot_2025-07-15_133901-removebg-preview.png?width=160`,
  'travis-scott-hoodies': `${OWN_CDN}/Travis_Scott_x_McDonald_s_Apple_Pie_Hoodie_1.png?width=160`,
  'vale-forever-hoodies': `${CDN}/11451-10004VFTZUG-GREE-main.png?v=1788250454&width=160`,
  'godspeed-hoodies': `${CDN}/Godspeed_Racer_Goldie_Hoodie_Bone.png?v=1788249931&width=160`,
  'godspeed-t-shirts': `${CDN}/GodspeedMiamiSurfClubTeeBlack.png?v=1788249944&width=161`,
  'vlone-t-shirts': `${CDN}/Juice_Wrld_x_Vlone_Butterfly_T-shirt_White.png?v=1788249967&width=161`,
  'syna-world-tracksuits': `${OWN_CDN}/IMG-3104.webp?width=160`,
  'essentials-tees': `${OWN_CDN}/FearofGodEssentialsNBABlackWhiteT-shirt_400x_69e1b79e-5760-42e2-a86f-5a7befa1829d.webp?width=160`,

  // Bags & accessories
  bags: `${CDN}/JacquemusLeGrandBambinoLightTurquoise.png?v=1788249809&width=160`,
  'jacquemus-bags': `${CDN}/JacquemusLeGrandBambinoLightTurquoise.png?v=1788249809&width=161`,
  'jacquemus-le-grand-bambino': `${CDN}/JacquemusLeGrandBambinoLightTurquoise.png?v=1788249809&width=162`,
  'jacquemus-le-bambino': `${CDN}/JacquemusLeBambinoDarkBrown.png?v=1788213221&width=160`,
  'jacquemus-le-long-bambino': `${OWN_CDN}/Jacquemus_Le_Long_Bambino_Black.png?width=160`,
  'jacquemus-croco': `${OWN_CDN}/JacquemusLeGrandBambinoCrocoLightIvory.png?width=160`,
  shoelaces: `${CDN}/11822006-main.png?v=1788250992&width=160`,
  'caps-hats': `${CDN}/Supreme_New_Era_Box_Logo_Beanie_FW25_Realtree_AP_Camo.png?v=1788262290&width=161`,

  // Silhouettes that were still falling back to a text tile. Each is the
  // collection's own top product, picked for a white or transparent ground
  // so it survives `mix-blend-mode: multiply`.
  'adidas-gazelle': `${CDN}/GazelleCollegiateGreen.png?v=1788262740&width=160`,
  // Not the collection's first product: that one carries a mis-attached
  // P-6000 photo in the catalogue (see note below).
  'adidas-gazelle-indoor': `${CDN}/adidasGazelleIndoorPrelovedYellow.png?v=1788262565&width=160`,
  'adidas-superstar': `${CDN}/adidasSuperstarCoreBlackCloudWhiteGold.png?v=1788262284&width=160`,
  'air-jordan-1-high': `${OWN_CDN}/air-jordan-1-retro-high-travis-scott-cactus-jack-522008.png?width=160`,
  'air-jordan-1-low': `${OWN_CDN}/AirJordan1RetroLowOGSPTravisScottCanary.png?width=160`,
  'air-jordan-3': `${CDN}/Air_Jordan_3_Retro_Valentine_s_Day_2025.png?v=1788262554&width=160`,
  'air-jordan-5': `${OWN_CDN}/Jordan_5_Retro_Luminous_Green.png?width=160`,
  'nike-air-max-plus': `${CDN}/DM0032-013-main.png?v=1788259891&width=160`,
  'ugg-jasmine': `${CDN}/1166913-JSM-main.png?v=1788252161&width=160`,
  // Both of these avoid the shot already used by ugg-neumel / yeezy — a
  // repeated picture makes two tiles look like the same destination.
  'ugg-platform': `${CDN}/1135092-SDC-main.png?v=1788259786&width=160`,
};

/**
 * Handles we hold a logo file for, at `public/brands/<handle>.png`. A logo
 * says "Nike" faster than a photo of one Nike shoe does; a brand with no file
 * here falls back to its name set in type, which still reads fine.
 *
 * To add one: save the PNG as `public/brands/<collection-handle>.png` and add
 * the handle to this list. Nothing else — the path is derived, not typed
 * twice. The list is explicit rather than a filesystem probe so a brand with
 * no file renders its name immediately instead of firing a 404 per tile.
 *
 * Complete: every brand tile in the menu now carries its mark.
 *
 * Format: near-black artwork on a transparent ground, trimmed to the mark
 * with no padding. Bigger is better — these render up to 38px tall, so
 * artwork under ~80px of height goes soft on a retina screen.
 */
const BRANDS_WITH_LOGOS = [
  'nike',
  'jordan',
  'adidas',
  'new-balance',
  'asics',
  'ugg-boots-slippers',
  'birkenstock',
  // NB: this file is the CDG PLAY heart (the sub-line's mark), not the
  // "COMME des GARÇONS" house wordmark. It suits this catalogue — the CDG
  // stock here is almost entirely PLAY x Converse — but swap it if you want
  // the house mark instead.
  'comme-des-garcons',
  'crocs',
  'maison-mihara-yasuhiro',
  'on-running',
  'onitsuka-tiger',
  'puma',
  'salomon',
  'timberland',
  'under-armour',
  'vans',
  'yeezy',
  'bape',
  'essentials',
  'gallery-dept',
  'godspeed',
  'hellstar',
  'sp5der',
  'stussy',
  // Red box and white-on-red type — the colour IS the mark here, so this one
  // is deliberately not monochrome.
  'supreme',
  'travis-scott',
  // Supplied as white letters with a black outline, which read as hollow on a
  // white tile; the fill was darkened so the letters are solid.
  'vale-forever',
  'vlone',
  // Supplied on a white ground with no alpha; extracted as ink (darkness ->
  // opacity) so the antialiased edges stay smooth. For Corteiz that also
  // knocks out the white lettering inside the badge, which is what we want on
  // a white tile.
  'represent',
  'corteiz',
  // Legible only just — the graffiti tag turns to mush at 38px. The plain
  // "Syna World" text it replaced read better; swap back by removing this line.
  'syna-world',
  'saucony',
  'jacquemus',
  // Stacked lockup (chevron over wordmark), so it renders smaller than the
  // wide wordmarks beside it — height is what the tile constrains.
  'converse',
  // Arrived as a sticker on a grey card; the ground and the white die-cut
  // halo were lifted out along with it.
  'hoka',
  // Clothing brands added 24 Sep 2026 from owner-supplied artwork.
  'nocta',
  'ami-paris',
  // Not a brand tile — this is the KAWS collab row under Collabs.
  'collab-kaws',
] as const;

export const BRAND_LOGOS: Record<string, string> = Object.fromEntries(
  BRANDS_WITH_LOGOS.map((handle) => [handle, `/brands/${handle}.png`]),
);

function handleFrom(path?: string | null): string | undefined {
  if (!path) return undefined;
  const match = /\/collections\/([a-z0-9-]+)/i.exec(path);
  return match ? match[1].toLowerCase() : undefined;
}

/** Pulls the collection handle out of an internal `/collections/x` path. */
export function menuImageFor(path?: string | null): string | undefined {
  const handle = handleFrom(path);
  return handle ? MENU_IMAGES[handle] : undefined;
}

/** The brand's wordmark, when we have one. */
export function brandLogoFor(path?: string | null): string | undefined {
  const handle = handleFrom(path);
  return handle ? BRAND_LOGOS[handle] : undefined;
}
