# Mi Polla 🎱

Aplicación Android y web **independiente del Modelo Lalo** para seguir una jugada personal de diez números en Ciudad Nocturna.

## Funciona así

- Una sola jugada personal por semana, de **diez números diferentes (00–99)**.
- Se revisan las **últimas dos cifras** de los **veinte premios** de cada Nocturna de Ciudad, de lunes a viernes.
- Cada terminación que aparece se pinta en el tablero general según el día de su **primera aparición de la semana** (lunes verde, martes celeste, miércoles naranja, jueves amarillo y viernes rosa).
- Los números personales que hayan acertado quedan destacados y asegurados hasta finalizar el viernes.
- Se puede **cambiar un número pendiente**. El cambio se registra con hora y fecha y comienza a contar desde la próxima Nocturna aún no sorteada. **Nunca hay aciertos retroactivos**.
- La app usa como referencia el horario habitual de las **21:00, hora argentina**, para decidir cuál es el próximo sorteo. El horario o plazo de inscripción del organizador puede ser distinto: **la inscripción válida siempre es la que figura en el sistema oficial de la Polla**.
- Los datos quedan guardados **solo en el teléfono** (almacenamiento local, sin Firebase, usuario ni servidor propio).
- Incluye respaldo manual en Ajustes; es importante antes de reinstalar.
- **Estudio** muestra frecuencias de sorteos descargados; no predice resultados ni asegura ganar.
- **Historial** conserva las jugadas y cambios del dispositivo.

## Fuente de las veinte posiciones

Se intenta leer `data/quiniela/ciudad/YYYY-MM-DD.json` del proyecto público [Sorteos AR](https://github.com/nfgalindez-aiko/sorteos-ar) y únicamente se incorpora automáticamente el turno `nocturna` cuando trae exactamente veinte premios de cuatro cifras y `validado: true`. Esta es una **fuente secundaria y externa**, que podría dejar de actualizarse o traer datos demorados. Se debe cotejar con el extracto oficial de Lotería de la Ciudad.

Si la fuente no está disponible, desde Resultados se pueden cargar veinte premios manualmente; quedan identificados como no verificados.

## Actualización de sorteos (v0.2.0 · 24/11/2026)

**Corregido:** la app ahora consulta los veinte premios de Ciudad Nocturna mediante el archivo de Sorteos AR y, si está atrasado o no validado, consulta el GitHub Contents API para obtener la versión actual. Nunca cuenta resultados con menos de 20 puestos ni con `validado:false`. La información guardada se mantiene si una consulta falla.

Se muestra la **hora de la última consulta** y un aviso diferenciado cuando el archivo aún no existe, está sin validar o falla la conexión. Mientras la app esté **abierta y en primer plano**, entre las 20:50 y las 23:45 (hora argentina), intenta de nuevo cada dos minutos si la nocturna de hoy sigue pendiente. Al regresar a la app también vuelve a comprobarla. **No funciona en segundo plano ni cuando la fuente todavía no publicó los datos**; la fuente externa puede seguir tardando después de las 21.

### Migrar sin perder la jugada de la APK v0.1

La primera APK fue firmada con una clave temporal de depuración, distinta de las posteriores. Por seguridad, la versión de prueba v0.2 se instala como **Mi Polla nueva**, un paquete independiente (`ar.mipolla.personal.nueva`) para **conservar la instalación anterior intacta**.

1. Abrí **Mi Polla** anterior → ⚙ Ajustes → **Ver / copiar respaldo**. Copiá todo el JSON y guardalo en Notas o un mensaje personal, fuera de la app.
2. Instalá **Mi Polla nueva**. Es otra app y no borra la anterior.
3. En Mi Polla nueva → ⚙ Ajustes → **Importar respaldo**; pegá el JSON completo. Comprobá nombre, diez números y aciertos.
4. Solo después de verificar todo, podés decidir si conservás ambas apps o desinstalás la anterior.

**Nota:** también la APK paralela usa una clave temporal en las compilaciones de GitHub. Para actualizaciones futuras sin reinstalación, hace falta configurar la firma privada estable de release, como se explica más abajo.

## Compilar APK

El repositorio usa HTML/CSS/JS offline empaquetado en una actividad Android WebView con `androidx.webkit.WebViewAssetLoader`. El proyecto Gradle está en `android/`.

Cada `push` a `main` ejecuta [GitHub Actions](../../actions/workflows/android-apk.yml) para:
1. Comprobar la sintaxis JavaScript y las reglas de la Polla.
2. Generar una **APK de prueba instalable** (artefacto `Mi-Polla-APK-Prueba`).

**Importante sobre las actualizaciones:** la APK de prueba utiliza una firma de depuración generada en el entorno de compilación. Esa firma puede cambiar entre ejecuciones, por lo que **no se garantiza instalar una nueva APK de prueba encima de la anterior**. Si hay que reinstalar, primero copiar el respaldo desde Ajustes.

### Firma estable para APK actualizable

Para actualizar sin desinstalar, configurar en **Settings → Secrets and variables → Actions** estas cuatro variables secretas (nunca publicar la clave privada):
- `MI_POLLA_KEYSTORE_B64`: archivo `.jks` de firma, codificado Base64.
- `MI_POLLA_STORE_PASSWORD`: contraseña del almacén.
- `MI_POLLA_KEY_ALIAS`: alias de la llave.
- `MI_POLLA_KEY_PASSWORD`: contraseña de la llave.

Con esos secretos, el workflow genera además el artefacto **`Mi-Polla-APK-Actualizable`**, con el mismo nombre de paquete `ar.mipolla.personal` y una firma persistente entre versiones. Guardar la llave privada en un lugar seguro: sin ella no se pueden firmar futuras actualizaciones compatibles.

Las APK de prueba y release usan **firmas distintas**: es necesario desinstalar la de prueba antes de la primera instalación de la versión firmada; luego las actualizaciones de esa versión son compatibles entre sí.

## Pruebas

```bash
node scripts/test-polla-core.cjs
node --check app.js
```

## Alcance de esta primera versión

Esta primera APK prioriza el seguimiento personal y las reglas correctas. Los motores VT2, Santiago/Neuquén y combinado permanecen **solo en el laboratorio de investigación** y no se muestran como pronósticos reales dentro de la app. No se modifica el Modelo Lalo.
