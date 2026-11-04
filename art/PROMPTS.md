# Арт для «Волшебники против Зомби»: промпты для Nano Banana 2 (Gemini)

## Как работать

1. Gemini → модель **Pro** (на Flash длинные промпты теряют ограничения). Проверять в каждом чате. Каждая картинка — новый чат.
2. Промпт вставлять **одной строкой**: перевод строки в Gemini отправляет сообщение. Ниже каждый промпт уже одним абзацем.
3. У каждой картинки указан **референс**: сначала прикрепить этот файл через «+» (из `art/raw/`, тот самый файл, а не пересохранённую копию; схема арены — из `art/layout/`), потом вставить промпт.
4. Скачать результат в `art/raw/<имя>` (имя — из заголовка, расширение то, что отдал Gemini), затем `npm run art -- <имя>`. Скрипт вырежет пурпурный фон, обрежет края, уменьшит и напечатает замеры с предупреждениями (⚠).
5. Скрипт проверяет только технику. Узнаётся ли предмет, совпадает ли стиль и не страшно ли детям, решает человек.

**Почему пурпурный фон.** Зомби зелёные, поэтому зелёный хромакей съел бы их. Пурпурный запрещён в самих объектах.

**Атласы.** Мелкие картинки экономят генерации: несколько объектов рисуются на одном листе, а `node tools/slice-atlas.mjs <атлас>` режет лист по пурпурным промежуткам и пишет `art/raw/<ассет>.png`. Сам лист лежит в `art/raw/atlas/`. Состав атласов — в `ATLASES` в `art/assets.js`. Если объектов на листе не столько, сколько ждём, скрипт откажется резать.

**Огонь и дым на проломах** рисует игра, поэтому на картинках дыма нет: он не вырезался бы с фона.

**Старые файлы.** Прежний плоский волшебник и зомби лежат в `art/raw/old/` и в игру не попадают.

---

## Волна 1 — пилот

Фон арены, замок и обычный зомби задают новый стиль. Пока пилот не принят, остальное не запускать.

### bg-arena
Фон арены 9:16. Референс — схема с точным положением дорожек: зомби ходят по этим координатам в коде. Важна верхняя часть, нижняя уходит под панели. Референс: **layout/bg-arena-layout.png**.

```
REFERENCE: the attached image is a LAYOUT sketch, keep the exact position, width and shape of its two light paths, the gate spot at the top and the empty ground, but replace the flat sketch with a finished painted scene. SUBJECT: an empty cute night graveyard meadow for a kids strategy game seen from above, a wide stone cemetery gate with an open iron arch at the top center where both paths begin, a low iron fence left and right of the gate, two wide smooth sandy dirt paths curving down from the gate along the left and the right side, soft teal and emerald grass between and beside the paths, a few small rounded friendly tombstones, little pumpkins, mushrooms and bushes only on the grass, never on the paths. Moonlit but bright and colorful, low detail on the paths so characters stay readable. The ground at the bottom part of the image is plain simple grass, empty. STYLE: stylized 3D-look cartoon game art for children, chunky simplified shapes, bright saturated colors, soft warm light with gentle ambient shading, smooth clean surfaces, big clear silhouette that reads on a tiny phone screen, friendly and not scary, camera looking down from above at about 45 degrees in three-quarter view. COMPOSITION: vertical portrait image with 9:16 aspect ratio, the scene fills the whole image edge to edge. FORBIDDEN: characters, zombies, castles, towers, buildings other than the gate, rivers, water, bridges, skeletons, scary faces, inset views, magnified details, second copies, text, letters, numbers, logos, watermark, frame, border.
```

### castle-s1-d0
Замок, стадия 1, целый: задаёт стиль построек. Референс: **bg-arena**.

```
REFERENCE: the attached image is a STYLE reference only, match its rendering, lighting, color richness and level of detail exactly, but do not copy the scene, the paths or the gate. SUBJECT: a humble little wooden fort: in front a low wall of pointed vertical logs with a simple arched wooden gate in the middle, behind it a small sturdy square wooden keep with glowing yellow windows and a flat wooden lookout platform on top, the platform is empty and wide enough for one small figure to stand on. STYLE: stylized 3D-look cartoon game art for children, chunky simplified shapes, bright saturated colors, soft warm light with gentle ambient shading, smooth clean surfaces, big clear silhouette that reads on a tiny phone screen, friendly and not scary, camera looking down from above at about 45 degrees in three-quarter view. COMPOSITION: one single building, centered, the whole building fully inside the frame with generous empty margin on all sides, square image. BACKGROUND: perfectly flat solid pure magenta color #FF00FF filling the entire background, no gradient, no floor, no ground shadow, no glow or smoke spilling onto the background. FORBIDDEN: smoke clouds, characters, any magenta or pink on the building, grass patch, library, treasure, inset views, magnified details, second copies, text, letters, numbers, logos, watermark, frame, border.
```

### zombie-walker
Обычный зомби в ракурсе 3/4: пилот персонажей. Цвет кожи поправлен по просьбе: прежний оливковый вариант приложен как референс. Референс: **old/zombie-walker-olive**.

```
REFERENCE: the attached image shows this zombie. Draw THE SAME zombie, same pose, same proportions, same outfit, same face, same camera and same framing, and change only the color: the skin becomes vivid bright saturated lime green like a fresh lime, not olive, not yellow, not muddy, and all colors become a little cleaner and brighter. STYLE: stylized 3D-look cartoon game art for children, chunky simplified shapes, bright saturated colors, soft warm light with gentle ambient shading, smooth clean surfaces, big clear silhouette that reads on a tiny phone screen, friendly and not scary, camera looking down from above at about 45 degrees in three-quarter view. COMPOSITION: one single character, centered, the whole character fully inside the frame with generous empty margin on all sides, square image. BACKGROUND: perfectly flat solid pure magenta color #FF00FF filling the entire background, no gradient, no floor, no ground shadow, no glow or smoke spilling onto the background. FORBIDDEN: blood, gore, exposed bones, scary faces, any magenta or pink on the character, scenery, multiple characters, inset views, magnified details, second copies, text, letters, numbers, logos, watermark, frame, border.
```

## Волна 2 — персонажи

Зомби, волшебник, каменный страж, иконка маны.

### zombie-runner
Бегун. Референс: **zombie-walker**.

```
REFERENCE: the attached image shows the existing zombie from the same game, match its rendering, skin color, proportions, camera angle and silliness exactly, but this is a DIFFERENT zombie with a different pose and outfit, do not copy the reference pose. SUBJECT: a skinny fast cartoon zombie for a kids game, full body, caught mid-sprint leaning forward with arms pumping and one leg lifted, lime-green skin, tongue sticking out to the side, a sweatband on the head, a faded yellow sports jersey and red sneakers with one untied lace flying, funny and clumsy rather than threatening, running toward the camera and slightly to the left. STYLE: stylized 3D-look cartoon game art for children, chunky simplified shapes, bright saturated colors, soft warm light with gentle ambient shading, smooth clean surfaces, big clear silhouette that reads on a tiny phone screen, friendly and not scary, camera looking down from above at about 45 degrees in three-quarter view. COMPOSITION: one single character, centered, the whole character fully inside the frame with generous empty margin on all sides, square image. BACKGROUND: perfectly flat solid pure magenta color #FF00FF filling the entire background, no gradient, no floor, no ground shadow, no glow or smoke spilling onto the background. FORBIDDEN: blood, gore, scary faces, any magenta or pink on the character, scenery, multiple characters, speed lines, inset views, magnified details, second copies, text, letters, numbers, logos, watermark, frame, border.
```

### zombie-bucket
Зомби в ведре. Референс: **zombie-walker**.

```
REFERENCE: the attached image shows the existing zombie from the same game, match its rendering, skin color, proportions, camera angle and silliness exactly, but this is a DIFFERENT zombie with a different pose and outfit, do not copy the reference pose. SUBJECT: a chunky armored cartoon zombie for a kids game, full body, wearing a dented metal bucket on its head as a helmet so that only one eye peeks out under the rim, a frying pan tied to its chest with rope as armor, lime-green skin, short and wide, stomping toward the camera and slightly to the left proudly with fists clenched, comical and harmless. STYLE: stylized 3D-look cartoon game art for children, chunky simplified shapes, bright saturated colors, soft warm light with gentle ambient shading, smooth clean surfaces, big clear silhouette that reads on a tiny phone screen, friendly and not scary, camera looking down from above at about 45 degrees in three-quarter view. COMPOSITION: one single character, centered, the whole character fully inside the frame with generous empty margin on all sides, square image. BACKGROUND: perfectly flat solid pure magenta color #FF00FF filling the entire background, no gradient, no floor, no ground shadow, no glow or smoke spilling onto the background. FORBIDDEN: blood, gore, scary faces, any magenta or pink on the character, scenery, multiple characters, speed lines, inset views, magnified details, second copies, text, letters, numbers, logos, watermark, frame, border.
```

### zombie-boss
Босс. Референс: **zombie-walker**.

```
REFERENCE: the attached image shows the existing zombie from the same game, match its rendering, skin color, proportions, camera angle and silliness exactly, but this is a DIFFERENT zombie with a different pose and outfit, do not copy the reference pose. SUBJECT: a huge round cartoon zombie giant for a kids game, full body, big belly, a torn dark red-purple cape clearly darker than magenta, lime-green skin, a tree-trunk club over its shoulder, grumpy but funny face with a single big tooth and a raised bushy eyebrow, powerful but silly, facing the camera and slightly to the left. STYLE: stylized 3D-look cartoon game art for children, chunky simplified shapes, bright saturated colors, soft warm light with gentle ambient shading, smooth clean surfaces, big clear silhouette that reads on a tiny phone screen, friendly and not scary, camera looking down from above at about 45 degrees in three-quarter view. COMPOSITION: one single character, centered, the whole character fully inside the frame with generous empty margin on all sides, square image. BACKGROUND: perfectly flat solid pure magenta color #FF00FF filling the entire background, no gradient, no floor, no ground shadow, no glow or smoke spilling onto the background. FORBIDDEN: blood, gore, scary faces, any magenta or pink on the character, scenery, multiple characters, speed lines, inset views, magnified details, second copies, text, letters, numbers, logos, watermark, frame, border.
```

### wizard
Волшебник. Прежний плоский рисунок лежит в art/raw/old. Референс: **zombie-walker**.

```
REFERENCE: the attached image is a STYLE reference only, match its rendering, lighting, color richness and level of detail exactly, but do not copy the zombie, draw only the wizard. SUBJECT: a cheerful young kid wizard, about 9 years old, full body, standing heroically and holding a wooden staff with a turquoise crystal on top, the other hand raised casting a small sparkle of magic, big expressive eyes, confident friendly smile, oversized deep-indigo wizard hat with golden stars and a slightly bent tip, indigo robe with golden trim, a short turquoise cape, brown boots, big head and short body, facing the camera and slightly to the right. The crystal looks bright only through its own colors, the sparkles are small solid shapes. STYLE: stylized 3D-look cartoon game art for children, chunky simplified shapes, bright saturated colors, soft warm light with gentle ambient shading, smooth clean surfaces, big clear silhouette that reads on a tiny phone screen, friendly and not scary, camera looking down from above at about 45 degrees in three-quarter view. COMPOSITION: one single character, centered, the whole character fully inside the frame with generous empty margin on all sides, square image. BACKGROUND: perfectly flat solid pure magenta color #FF00FF filling the entire background, no gradient, no floor, no ground shadow, no glow or smoke spilling onto the background. FORBIDDEN: halo, aura, bloom, soft glow around the crystal or the hand, any magenta or pink on the character, scenery, multiple characters, inset views, magnified details, second copies, text, letters, numbers, logos, watermark, frame, border.
```

### guardian
Каменный страж. Референс: **zombie-walker**.

```
REFERENCE: the attached image is a STYLE reference only, match its rendering, lighting, color richness and level of detail exactly, but do not copy the zombie, draw only the golem. SUBJECT: a chunky friendly stone golem guardian for a kids game, full body, built from big rounded grey boulders with moss patches, glowing turquoise eyes and a turquoise rune on its chest, wide stance with big fists ready to block the way, kind and sturdy, facing the camera. STYLE: stylized 3D-look cartoon game art for children, chunky simplified shapes, bright saturated colors, soft warm light with gentle ambient shading, smooth clean surfaces, big clear silhouette that reads on a tiny phone screen, friendly and not scary, camera looking down from above at about 45 degrees in three-quarter view. COMPOSITION: one single character, centered, the whole character fully inside the frame with generous empty margin on all sides, square image. BACKGROUND: perfectly flat solid pure magenta color #FF00FF filling the entire background, no gradient, no floor, no ground shadow, no glow or smoke spilling onto the background. FORBIDDEN: scary faces, any magenta or pink, scenery, multiple characters, inset views, magnified details, second copies, text, letters, numbers, logos, watermark, frame, border.
```

### icon-mana
Иконка маны. Референс — волшебник: от зомби в иконку протекали ноги. Референс: **wizard**.

```
REFERENCE: the attached image is a STYLE reference only, match its rendering, lighting and color richness, but do not copy the wizard or any part of him. SUBJECT: a single faceted magic mana crystal icon for a kids game, an object and not a creature, a plain gem standing alone, violet and turquoise, big and simple with one white shine highlight, readable at 24 pixels. STYLE: stylized 3D-look cartoon game art for children, chunky simplified shapes, bright saturated colors, soft warm light with gentle ambient shading, smooth clean surfaces, big clear silhouette that reads on a tiny phone screen, friendly and not scary, camera looking down from above at about 45 degrees in three-quarter view. COMPOSITION: one single crystal, centered, the whole crystal fully inside the frame with small even empty margin on all sides, square image. BACKGROUND: perfectly flat solid pure magenta color #FF00FF filling the entire background, no gradient, no floor, no ground shadow, no glow or smoke spilling onto the background. FORBIDDEN: legs, feet, boots, arms, hands, face, eyes, any body parts, characters, clothes, stand, base, halo, aura, soft glow, any magenta or pink, inset views, magnified details, second copies, text, letters, numbers, logos, watermark, frame, border.
```

## Волна 3 — замок и башни

Сначала целые версии, поверх них повреждённые: целую версию прикладывать референсом, чтобы контур не прыгал при смене состояния. Внутри волны идти сверху вниз.

### castle-s1-d1
Трещины и выбитые камни (66–34%). Референс: **castle-s1-d0**.

```
REFERENCE: the attached image is the intact castle. Draw THE SAME castle, same camera, same framing, same size and same position in the frame, its outer contour must stay where it is, only the damage described below changes. SUBJECT: the same castle with light damage: several cracks across the walls and a few knocked out blocks or broken logs, one missing battlement, everything still standing. STYLE: stylized 3D-look cartoon game art for children, chunky simplified shapes, bright saturated colors, soft warm light with gentle ambient shading, smooth clean surfaces, big clear silhouette that reads on a tiny phone screen, friendly and not scary, camera looking down from above at about 45 degrees in three-quarter view. BACKGROUND: perfectly flat solid pure magenta color #FF00FF filling the entire background, no gradient, no floor, no ground shadow, no glow or smoke spilling onto the background. FORBIDDEN: smoke clouds, characters, any magenta or pink on the building, inset views, magnified details, second copies, text, letters, numbers, logos, watermark, frame, border.
```

### castle-s1-d2
Проломы (33–1%). Огонь и дым добавляет игра. Референс: **castle-s1-d0**.

```
REFERENCE: the attached image is the intact castle. Draw THE SAME castle, same camera, same framing, same size and same position in the frame, its outer contour must stay where it is, only the damage described below changes. SUBJECT: the same castle with heavy damage: big breaches with dark holes in the walls, broken top edges, soot marks and a couple of small solid cartoon flames inside the holes, still standing but badly hurt. STYLE: stylized 3D-look cartoon game art for children, chunky simplified shapes, bright saturated colors, soft warm light with gentle ambient shading, smooth clean surfaces, big clear silhouette that reads on a tiny phone screen, friendly and not scary, camera looking down from above at about 45 degrees in three-quarter view. BACKGROUND: perfectly flat solid pure magenta color #FF00FF filling the entire background, no gradient, no floor, no ground shadow, no glow or smoke spilling onto the background. FORBIDDEN: smoke clouds, characters, any magenta or pink on the building, inset views, magnified details, second copies, text, letters, numbers, logos, watermark, frame, border.
```

### castle-s1-d3
Руины (0). Референс: **castle-s1-d0**.

```
REFERENCE: the attached image is the intact castle. Draw THE SAME castle, same camera, same framing, same size and same position in the frame, its outer contour must stay where it is, only the damage described below changes. SUBJECT: the same castle destroyed, only broken stumps of the walls and piles of rubble on the same footprint, in the same materials and colors, no flames, cartoonish and not gloomy. STYLE: stylized 3D-look cartoon game art for children, chunky simplified shapes, bright saturated colors, soft warm light with gentle ambient shading, smooth clean surfaces, big clear silhouette that reads on a tiny phone screen, friendly and not scary, camera looking down from above at about 45 degrees in three-quarter view. BACKGROUND: perfectly flat solid pure magenta color #FF00FF filling the entire background, no gradient, no floor, no ground shadow, no glow or smoke spilling onto the background. FORBIDDEN: smoke clouds, characters, any magenta or pink on the building, inset views, magnified details, second copies, text, letters, numbers, logos, watermark, frame, border.
```

### castle-s2-d0
Стены 4–7: стадия 2, целая. Референс: **castle-s1-d0**.

```
REFERENCE: the attached image shows the same castle at the previous stage, keep exactly the same camera, framing, footprint, proportions, keep position and overall layout, and show it upgraded. SUBJECT: a cute stone castle of the same layout: in front a low wall of lavender-grey stone blocks with crenellations, square corner turrets and an arched wooden gate in the middle, behind it a square stone keep with glowing yellow windows and a flat crenellated platform on top, the platform is empty and wide enough for one small figure to stand on. STYLE: stylized 3D-look cartoon game art for children, chunky simplified shapes, bright saturated colors, soft warm light with gentle ambient shading, smooth clean surfaces, big clear silhouette that reads on a tiny phone screen, friendly and not scary, camera looking down from above at about 45 degrees in three-quarter view. COMPOSITION: one single building, centered, the whole building fully inside the frame with generous empty margin on all sides, square image. BACKGROUND: perfectly flat solid pure magenta color #FF00FF filling the entire background, no gradient, no floor, no ground shadow, no glow or smoke spilling onto the background. FORBIDDEN: smoke clouds, characters, any magenta or pink on the building, grass patch, library, treasure, inset views, magnified details, second copies, text, letters, numbers, logos, watermark, frame, border.
```

### castle-s2-d1
Трещины и выбитые камни (66–34%). Референс: **castle-s2-d0**.

```
REFERENCE: the attached image is the intact castle. Draw THE SAME castle, same camera, same framing, same size and same position in the frame, its outer contour must stay where it is, only the damage described below changes. SUBJECT: the same castle with light damage: several cracks across the walls and a few knocked out blocks or broken logs, one missing battlement, everything still standing. STYLE: stylized 3D-look cartoon game art for children, chunky simplified shapes, bright saturated colors, soft warm light with gentle ambient shading, smooth clean surfaces, big clear silhouette that reads on a tiny phone screen, friendly and not scary, camera looking down from above at about 45 degrees in three-quarter view. BACKGROUND: perfectly flat solid pure magenta color #FF00FF filling the entire background, no gradient, no floor, no ground shadow, no glow or smoke spilling onto the background. FORBIDDEN: smoke clouds, characters, any magenta or pink on the building, inset views, magnified details, second copies, text, letters, numbers, logos, watermark, frame, border.
```

### castle-s2-d2
Проломы (33–1%). Огонь и дым добавляет игра. Референс: **castle-s2-d0**.

```
REFERENCE: the attached image is the intact castle. Draw THE SAME castle, same camera, same framing, same size and same position in the frame, its outer contour must stay where it is, only the damage described below changes. SUBJECT: the same castle with heavy damage: big breaches with dark holes in the walls, broken top edges, soot marks and a couple of small solid cartoon flames inside the holes, still standing but badly hurt. STYLE: stylized 3D-look cartoon game art for children, chunky simplified shapes, bright saturated colors, soft warm light with gentle ambient shading, smooth clean surfaces, big clear silhouette that reads on a tiny phone screen, friendly and not scary, camera looking down from above at about 45 degrees in three-quarter view. BACKGROUND: perfectly flat solid pure magenta color #FF00FF filling the entire background, no gradient, no floor, no ground shadow, no glow or smoke spilling onto the background. FORBIDDEN: smoke clouds, characters, any magenta or pink on the building, inset views, magnified details, second copies, text, letters, numbers, logos, watermark, frame, border.
```

### castle-s2-d3
Руины (0). Референс: **castle-s2-d0**.

```
REFERENCE: the attached image is the intact castle. Draw THE SAME castle, same camera, same framing, same size and same position in the frame, its outer contour must stay where it is, only the damage described below changes. SUBJECT: the same castle destroyed, only broken stumps of the walls and piles of rubble on the same footprint, in the same materials and colors, no flames, cartoonish and not gloomy. STYLE: stylized 3D-look cartoon game art for children, chunky simplified shapes, bright saturated colors, soft warm light with gentle ambient shading, smooth clean surfaces, big clear silhouette that reads on a tiny phone screen, friendly and not scary, camera looking down from above at about 45 degrees in three-quarter view. BACKGROUND: perfectly flat solid pure magenta color #FF00FF filling the entire background, no gradient, no floor, no ground shadow, no glow or smoke spilling onto the background. FORBIDDEN: smoke clouds, characters, any magenta or pink on the building, inset views, magnified details, second copies, text, letters, numbers, logos, watermark, frame, border.
```

### castle-s3-d0
Стены 8–11: стадия 3, целая. Референс: **castle-s2-d0**.

```
REFERENCE: the attached image shows the same castle at the previous stage, keep exactly the same camera, framing, footprint, proportions, keep position and overall layout, and show it upgraded. SUBJECT: a strong fortified castle of the same layout: dark grey stone walls reinforced with riveted iron bands and iron corner plates, corner turrets with pointed iron roofs, a heavy gate with iron straps in the middle, behind it a square stone keep with iron bands and glowing windows and a flat crenellated platform on top, the platform is empty and wide enough for one small figure to stand on. STYLE: stylized 3D-look cartoon game art for children, chunky simplified shapes, bright saturated colors, soft warm light with gentle ambient shading, smooth clean surfaces, big clear silhouette that reads on a tiny phone screen, friendly and not scary, camera looking down from above at about 45 degrees in three-quarter view. COMPOSITION: one single building, centered, the whole building fully inside the frame with generous empty margin on all sides, square image. BACKGROUND: perfectly flat solid pure magenta color #FF00FF filling the entire background, no gradient, no floor, no ground shadow, no glow or smoke spilling onto the background. FORBIDDEN: smoke clouds, characters, any magenta or pink on the building, grass patch, library, treasure, inset views, magnified details, second copies, text, letters, numbers, logos, watermark, frame, border.
```

### castle-s3-d1
Трещины и выбитые камни (66–34%). Референс: **castle-s3-d0**.

```
REFERENCE: the attached image is the intact castle. Draw THE SAME castle, same camera, same framing, same size and same position in the frame, its outer contour must stay where it is, only the damage described below changes. SUBJECT: the same castle with light damage: several cracks across the walls and a few knocked out blocks or broken logs, one missing battlement, everything still standing. STYLE: stylized 3D-look cartoon game art for children, chunky simplified shapes, bright saturated colors, soft warm light with gentle ambient shading, smooth clean surfaces, big clear silhouette that reads on a tiny phone screen, friendly and not scary, camera looking down from above at about 45 degrees in three-quarter view. BACKGROUND: perfectly flat solid pure magenta color #FF00FF filling the entire background, no gradient, no floor, no ground shadow, no glow or smoke spilling onto the background. FORBIDDEN: smoke clouds, characters, any magenta or pink on the building, inset views, magnified details, second copies, text, letters, numbers, logos, watermark, frame, border.
```

### castle-s3-d2
Проломы (33–1%). Огонь и дым добавляет игра. Референс: **castle-s3-d0**.

```
REFERENCE: the attached image is the intact castle. Draw THE SAME castle, same camera, same framing, same size and same position in the frame, its outer contour must stay where it is, only the damage described below changes. SUBJECT: the same castle with heavy damage: big breaches with dark holes in the walls, broken top edges, soot marks and a couple of small solid cartoon flames inside the holes, still standing but badly hurt. STYLE: stylized 3D-look cartoon game art for children, chunky simplified shapes, bright saturated colors, soft warm light with gentle ambient shading, smooth clean surfaces, big clear silhouette that reads on a tiny phone screen, friendly and not scary, camera looking down from above at about 45 degrees in three-quarter view. BACKGROUND: perfectly flat solid pure magenta color #FF00FF filling the entire background, no gradient, no floor, no ground shadow, no glow or smoke spilling onto the background. FORBIDDEN: smoke clouds, characters, any magenta or pink on the building, inset views, magnified details, second copies, text, letters, numbers, logos, watermark, frame, border.
```

### castle-s3-d3
Руины (0). Референс: **castle-s3-d0**.

```
REFERENCE: the attached image is the intact castle. Draw THE SAME castle, same camera, same framing, same size and same position in the frame, its outer contour must stay where it is, only the damage described below changes. SUBJECT: the same castle destroyed, only broken stumps of the walls and piles of rubble on the same footprint, in the same materials and colors, no flames, cartoonish and not gloomy. STYLE: stylized 3D-look cartoon game art for children, chunky simplified shapes, bright saturated colors, soft warm light with gentle ambient shading, smooth clean surfaces, big clear silhouette that reads on a tiny phone screen, friendly and not scary, camera looking down from above at about 45 degrees in three-quarter view. BACKGROUND: perfectly flat solid pure magenta color #FF00FF filling the entire background, no gradient, no floor, no ground shadow, no glow or smoke spilling onto the background. FORBIDDEN: smoke clouds, characters, any magenta or pink on the building, inset views, magnified details, second copies, text, letters, numbers, logos, watermark, frame, border.
```

### castle-s4-d0
Стены 12–15: стадия 4, целая. Референс: **castle-s3-d0**.

```
REFERENCE: the attached image shows the same castle at the previous stage, keep exactly the same camera, framing, footprint, proportions, keep position and overall layout, and show it upgraded. SUBJECT: a majestic magical fortress of the same layout: indigo and violet enchanted stone walls with softly glowing turquoise runes painted on them, golden trim, slender corner turrets with pointed indigo roofs topped by turquoise crystals, an ornate gate with a rune in the middle, behind it a square keep with glowing windows and a flat crenellated platform on top, the platform is empty and wide enough for one small figure to stand on. STYLE: stylized 3D-look cartoon game art for children, chunky simplified shapes, bright saturated colors, soft warm light with gentle ambient shading, smooth clean surfaces, big clear silhouette that reads on a tiny phone screen, friendly and not scary, camera looking down from above at about 45 degrees in three-quarter view. COMPOSITION: one single building, centered, the whole building fully inside the frame with generous empty margin on all sides, square image. BACKGROUND: perfectly flat solid pure magenta color #FF00FF filling the entire background, no gradient, no floor, no ground shadow, no glow or smoke spilling onto the background. FORBIDDEN: smoke clouds, characters, any magenta or pink on the building, grass patch, library, treasure, inset views, magnified details, second copies, text, letters, numbers, logos, watermark, frame, border.
```

### castle-s4-d1
Трещины и выбитые камни (66–34%). Референс: **castle-s4-d0**.

```
REFERENCE: the attached image is the intact castle. Draw THE SAME castle, same camera, same framing, same size and same position in the frame, its outer contour must stay where it is, only the damage described below changes. SUBJECT: the same castle with light damage: several cracks across the walls and a few knocked out blocks or broken logs, one missing battlement, everything still standing. STYLE: stylized 3D-look cartoon game art for children, chunky simplified shapes, bright saturated colors, soft warm light with gentle ambient shading, smooth clean surfaces, big clear silhouette that reads on a tiny phone screen, friendly and not scary, camera looking down from above at about 45 degrees in three-quarter view. BACKGROUND: perfectly flat solid pure magenta color #FF00FF filling the entire background, no gradient, no floor, no ground shadow, no glow or smoke spilling onto the background. FORBIDDEN: smoke clouds, characters, any magenta or pink on the building, inset views, magnified details, second copies, text, letters, numbers, logos, watermark, frame, border.
```

### castle-s4-d2
Проломы (33–1%). Огонь и дым добавляет игра. Референс: **castle-s4-d0**.

```
REFERENCE: the attached image is the intact castle. Draw THE SAME castle, same camera, same framing, same size and same position in the frame, its outer contour must stay where it is, only the damage described below changes. SUBJECT: the same castle with heavy damage: big breaches with dark holes in the walls, broken top edges, soot marks and a couple of small solid cartoon flames inside the holes, still standing but badly hurt. STYLE: stylized 3D-look cartoon game art for children, chunky simplified shapes, bright saturated colors, soft warm light with gentle ambient shading, smooth clean surfaces, big clear silhouette that reads on a tiny phone screen, friendly and not scary, camera looking down from above at about 45 degrees in three-quarter view. BACKGROUND: perfectly flat solid pure magenta color #FF00FF filling the entire background, no gradient, no floor, no ground shadow, no glow or smoke spilling onto the background. FORBIDDEN: smoke clouds, characters, any magenta or pink on the building, inset views, magnified details, second copies, text, letters, numbers, logos, watermark, frame, border.
```

### castle-s4-d3
Руины (0). Референс: **castle-s4-d0**.

```
REFERENCE: the attached image is the intact castle. Draw THE SAME castle, same camera, same framing, same size and same position in the frame, its outer contour must stay where it is, only the damage described below changes. SUBJECT: the same castle destroyed, only broken stumps of the walls and piles of rubble on the same footprint, in the same materials and colors, no flames, cartoonish and not gloomy. STYLE: stylized 3D-look cartoon game art for children, chunky simplified shapes, bright saturated colors, soft warm light with gentle ambient shading, smooth clean surfaces, big clear silhouette that reads on a tiny phone screen, friendly and not scary, camera looking down from above at about 45 degrees in three-quarter view. BACKGROUND: perfectly flat solid pure magenta color #FF00FF filling the entire background, no gradient, no floor, no ground shadow, no glow or smoke spilling onto the background. FORBIDDEN: smoke clouds, characters, any magenta or pink on the building, inset views, magnified details, second copies, text, letters, numbers, logos, watermark, frame, border.
```

### atlas-tower-s1
Атлас: Башня, вид 1: целая, трещины, проломы, груда камней. Референс: **old/tower-s1-d0-single**.

```
REFERENCE: the attached image is the intact guard tower. SUBJECT: a sprite sheet of ONE guard tower shown in four damage states side by side, all four the same size, same camera and standing on the same baseline, so that the states match exactly. The tower is the wooden watchtower from the reference. From left to right: first intact; second with light damage, several cracks and a few knocked out blocks or broken planks, one missing battlement; third with heavy damage, big breaches with dark holes, broken top edge, soot marks and a couple of small solid cartoon flames, still standing; fourth destroyed, a short broken stump and a heap of stones on the same footprint in the same materials and colors, no flames. STYLE: stylized 3D-look cartoon game art for children, chunky simplified shapes, bright saturated colors, soft warm light with gentle ambient shading, smooth clean surfaces, big clear silhouette that reads on a tiny phone screen, friendly and not scary, camera looking down from above at about 45 degrees in three-quarter view. COMPOSITION: a sprite sheet on a square image: exactly 4 separate objects in one horizontal row, evenly spaced across the whole width, with clear empty magenta gaps between them and around them, nothing overlapping and nothing touching the edge of the image. BACKGROUND: perfectly flat solid pure magenta color #FF00FF filling the entire background and all the gaps between the objects, no gradient, no floor, no ground shadow, no glow or smoke spilling onto the background. FORBIDDEN: smoke clouds, characters, any magenta or pink on the tower, halo, aura, bloom, soft glow around the crystal, castle walls, labels, dividing lines, grid lines, panels, inset views, magnified details, second copies beyond those listed, text, letters, numbers, logos, watermark, frame, border.
```

### atlas-tower-s2
Атлас: Башня, вид 2: целая, трещины, проломы, груда камней. Референс: **old/tower-s2-d0-single**.

```
REFERENCE: the attached image is the intact guard tower. SUBJECT: a sprite sheet of ONE guard tower shown in four damage states side by side, all four the same size, same camera and standing on the same baseline, so that the states match exactly. The tower is the stone guard tower from the reference. From left to right: first intact; second with light damage, several cracks and a few knocked out blocks or broken planks, one missing battlement; third with heavy damage, big breaches with dark holes, broken top edge, soot marks and a couple of small solid cartoon flames, still standing; fourth destroyed, a short broken stump and a heap of stones on the same footprint in the same materials and colors, no flames. STYLE: stylized 3D-look cartoon game art for children, chunky simplified shapes, bright saturated colors, soft warm light with gentle ambient shading, smooth clean surfaces, big clear silhouette that reads on a tiny phone screen, friendly and not scary, camera looking down from above at about 45 degrees in three-quarter view. COMPOSITION: a sprite sheet on a square image: exactly 4 separate objects in one horizontal row, evenly spaced across the whole width, with clear empty magenta gaps between them and around them, nothing overlapping and nothing touching the edge of the image. BACKGROUND: perfectly flat solid pure magenta color #FF00FF filling the entire background and all the gaps between the objects, no gradient, no floor, no ground shadow, no glow or smoke spilling onto the background. FORBIDDEN: smoke clouds, characters, any magenta or pink on the tower, halo, aura, bloom, soft glow around the crystal, castle walls, labels, dividing lines, grid lines, panels, inset views, magnified details, second copies beyond those listed, text, letters, numbers, logos, watermark, frame, border.
```

### atlas-tower-s3
Атлас: Башня, вид 3: целая, трещины, проломы, груда камней. Референс: **tower-s2-d0**.

```
REFERENCE: the attached image shows the same guard tower at the previous stage, keep the same camera and the same chunky width, and draw its upgraded version. SUBJECT: a sprite sheet of ONE guard tower shown in four damage states side by side, all four the same size, same camera and standing on the same baseline, so that the states match exactly. The tower is a magical guard tower in indigo enchanted stone with turquoise runes painted on it, golden trim, a short pointed indigo roof and a turquoise crystal fixed on the very tip of the roof, as wide and chunky as the tower in the reference and only a little taller, sturdy and not slender. From left to right: first intact; second with light damage, several cracks and a few knocked out blocks or broken planks, one missing battlement; third with heavy damage, big breaches with dark holes, broken top edge, soot marks and a couple of small solid cartoon flames, still standing; fourth destroyed, a short broken stump and a heap of stones on the same footprint in the same materials and colors, no flames. STYLE: stylized 3D-look cartoon game art for children, chunky simplified shapes, bright saturated colors, soft warm light with gentle ambient shading, smooth clean surfaces, big clear silhouette that reads on a tiny phone screen, friendly and not scary, camera looking down from above at about 45 degrees in three-quarter view. COMPOSITION: a sprite sheet on a square image: exactly 4 separate objects in one horizontal row, evenly spaced across the whole width, with clear empty magenta gaps between them and around them, nothing overlapping and nothing touching the edge of the image. BACKGROUND: perfectly flat solid pure magenta color #FF00FF filling the entire background and all the gaps between the objects, no gradient, no floor, no ground shadow, no glow or smoke spilling onto the background. FORBIDDEN: smoke clouds, characters, any magenta or pink on the tower, halo, aura, bloom, soft glow around the crystal, castle walls, labels, dividing lines, grid lines, panels, inset views, magnified details, second copies beyond those listed, text, letters, numbers, logos, watermark, frame, border.
```

## Волна 4 — пристройки и леса

Библиотека, сокровищница, строительные леса.

### atlas-library
Атлас: Библиотека, три стадии роста. Референс: **castle-s1-d0**.

```
REFERENCE: the attached image is a STYLE reference only, match its rendering, lighting, color richness and level of detail exactly, but do not copy the castle. SUBJECT: a sprite sheet of ONE library building for a kids game growing through three stages, same camera. From left to right: first a small stone annex with a dome shaped like a big open book, its curved pages form the roof, a little window glowing warm yellow; second a larger stone library with a side wing and a bigger open book dome, several glowing windows; third a grand magical library in indigo enchanted stone with golden trim, a huge open book dome, glowing windows, turquoise runes and a turquoise crystal fixed above the book. STYLE: stylized 3D-look cartoon game art for children, chunky simplified shapes, bright saturated colors, soft warm light with gentle ambient shading, smooth clean surfaces, big clear silhouette that reads on a tiny phone screen, friendly and not scary, camera looking down from above at about 45 degrees in three-quarter view. COMPOSITION: a sprite sheet on a square image: exactly 3 separate buildings in one horizontal row, evenly spaced across the whole width, with clear empty magenta gaps between them and around them, nothing overlapping and nothing touching the edge of the image. BACKGROUND: perfectly flat solid pure magenta color #FF00FF filling the entire background and all the gaps between the objects, no gradient, no floor, no ground shadow, no glow or smoke spilling onto the background. FORBIDDEN: characters, any magenta or pink, grass patch, labels, dividing lines, grid lines, panels, inset views, magnified details, second copies beyond those listed, text, letters, numbers, logos, watermark, frame, border.
```

### atlas-treasury
Атлас: Сокровищница, три стадии. Референс: **library-s1**. Принятый лист лёг сеткой 2×2: слева вверху стадия 1, справа вверху стадия 2, слева внизу лишняя копия стадии 2 (не используется), справа внизу стадия 3.

```
REFERENCE: the attached image is a STYLE reference only, match its rendering, lighting, color richness and level of detail exactly, but do not copy the building. SUBJECT: a sprite sheet of ONE treasury for a kids game growing through three stages, same camera and coin style. From left to right: first a small pile of shiny gold coins with one little wooden treasure chest beside it; second several big piles of gold coins and three wooden chests, one open and full of coins, a small stone vault behind them; third a mountain of gold coins, many chests with golden trim and gems, and a grand vault with a golden roof behind them. Each stage is one compact group with its pieces touching, and the groups stand large and fill the height of the image. STYLE: stylized 3D-look cartoon game art for children, chunky simplified shapes, bright saturated colors, soft warm light with gentle ambient shading, smooth clean surfaces, big clear silhouette that reads on a tiny phone screen, friendly and not scary, camera looking down from above at about 45 degrees in three-quarter view. COMPOSITION: a sprite sheet on a square image: exactly 3 separate groups in one horizontal row, evenly spaced across the whole width, with clear empty magenta gaps between them and around them, nothing above or below the row, nothing overlapping and nothing touching the edge of the image. BACKGROUND: perfectly flat solid pure magenta color #FF00FF filling the entire background and all the gaps between the objects, no gradient, no floor, no ground shadow, no glow or smoke spilling onto the background. FORBIDDEN: fences, palisades, wooden stakes, walls, ghosted, translucent or blurred shapes, faded copies of the reference, characters, any magenta or pink, grass patch, labels, dividing lines, grid lines, panels, inset views, magnified details, second copies beyond those listed, text, letters, numbers, logos, watermark, frame, border.
```

### scaffold
Строительные леса: накладываются на постройку, середина должна быть пустой. Референс: **library-s1**.

```
REFERENCE: the attached image is a STYLE reference only, match its rendering, lighting, color richness and level of detail exactly, but do not copy the building. SUBJECT: empty cartoon wooden construction scaffolding for a kids game, seen from the front, a flat open lattice of thin vertical wooden poles and horizontal rails with a few diagonal braces and rope knots, like a wide fence-shaped grid, wider than tall, most of the area is empty see-through gaps between the poles. STYLE: stylized 3D-look cartoon game art for children, chunky simplified shapes, bright saturated colors, soft warm light with gentle ambient shading, smooth clean surfaces, big clear silhouette that reads on a tiny phone screen, friendly and not scary, seen straight from the front. COMPOSITION: one single scaffolding, centered, the whole scaffolding fully inside the frame with generous empty margin on all sides, square image. BACKGROUND: perfectly flat solid pure magenta color #FF00FF filling the entire background, no gradient, no floor, no ground shadow, no glow or smoke spilling onto the background. FORBIDDEN: floor, deck, platform, walkway, boards laid across the middle, box or cube shape, depth, buildings, walls, solid fences, palisades, ghosted, translucent or blurred shapes, faded copies of the reference, characters, any magenta or pink, inset views, magnified details, second copies, text, letters, numbers, logos, watermark, frame, border.
```

## Волна 5 — карты

Шесть картинок и рамка.

### atlas-cards
Атлас: Шесть картинок для карт. Порядок: огонь, лёд, молния, страж, лечение, метеорит. Референс: **zombie-walker**.

```
REFERENCE: the attached image is a STYLE reference only, match its rendering, lighting and color richness exactly, but do not copy the zombie or any part of it. SUBJECT: a sprite sheet of six game card illustrations for a kids game, each one big simple object that reads at 70 pixels. Top row from left to right: a big swirling cartoon fireball flying down, orange and yellow flame with a white-hot center; a jagged wall of chunky blue ice crystals with solid frosty sparkles; a bright yellow zigzag lightning bolt splitting into three branches. Bottom row from left to right: the head and shoulders of a friendly stone golem with glowing turquoise eyes; a big soft green heart inside a green magic ring with small plus-shaped sparkles; a huge rock meteor with a flaming tail falling diagonally. STYLE: stylized 3D-look cartoon game art for children, chunky simplified shapes, bright saturated colors, soft warm light with gentle ambient shading, smooth clean surfaces, big clear silhouette that reads on a tiny phone screen, friendly and not scary. COMPOSITION: a sprite sheet on a square image: exactly six separate objects in two rows of three, evenly spaced, with clear empty magenta gaps between them and around them, nothing overlapping and nothing touching the edge of the image. BACKGROUND: perfectly flat solid pure magenta color #FF00FF filling the entire background and all the gaps between the objects, no gradient, no floor, no ground shadow, no glow or smoke spilling onto the background. FORBIDDEN: any magenta or pink, scenery, card frames, characters other than the golem head, legs, feet, arms, faces on objects, labels, dividing lines, grid lines, panels, inset views, magnified details, second copies beyond those listed, text, letters, numbers, logos, watermark, frame, border.
```

### card-frame
Рамка карты: вертикальная, середина — пурпурная, станет прозрачной. Референс: **card-fireball**.

```
REFERENCE: the attached image is a STYLE reference only, match its rendering, lighting, color richness and level of detail exactly, but do not copy the fireball. SUBJECT: an empty vertical game card frame for a kids game, a thick rounded rectangular border of polished violet stone with golden corners, the entire inside of the frame is empty. STYLE: stylized 3D-look cartoon game art for children, chunky simplified shapes, bright saturated colors, soft warm light with gentle ambient shading, smooth clean surfaces, big clear silhouette that reads on a tiny phone screen, friendly and not scary, seen straight from the front. COMPOSITION: one single frame with 3:4 proportions, centered, fully inside the image with a small margin, square image. BACKGROUND: perfectly flat solid pure magenta color #FF00FF filling the entire background and the entire inside of the frame, no gradient, no floor, no ground shadow, no glow or smoke spilling onto the background. FORBIDDEN: any picture inside the frame, any magenta or pink on the frame itself, inset views, magnified details, second copies, text, letters, numbers, logos, watermark.
```
