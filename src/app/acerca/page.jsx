import Link from "next/link";
import PublicInfoPage from "@/components/PublicInfoPage";

export const metadata = { title: "AFP · Finanzas personales", description: "Organiza tus gastos, cortes, pagos y cobros con AFP." };

export default function AboutPage() {
  return <PublicInfoPage title="Tus finanzas, con sus fechas claras." intro="AFP es una aplicación de uso personal para organizar gastos, tarjetas, suscripciones y cuentas por cobrar o pagar.">
    <section><h2>Una agenda para tus compromisos</h2><p>Registra los cortes y vencimientos de tus tarjetas, sigue tus abonos y consulta los cobros pendientes. Las fechas y los movimientos se administran en AFP.</p></section>
    <section><h2>Conecta tu Google Calendar</h2><p>La conexión opcional crea un calendario llamado AFP en tu cuenta de Google. Ahí se reflejan los cortes, pagos, suscripciones y cobros que elijas, para consultarlos desde Google Calendar y sus widgets en tu celular.</p><p>AFP actualiza los eventos al cambiar tus registros. Las fechas proyectadas se identifican como previstas; confirma en AFP los cambios que indique tu banco. Los importes solo se incluyen si activas esa opción.</p></section>
    <section><h2>Tú controlas la conexión</h2><p>Puedes elegir los tipos de eventos, activar recordatorios y desconectar tu cuenta desde Configuración. Consulta cómo se usan los permisos y datos de Google en la <Link href="/privacidad">política de privacidad</Link>.</p></section>
    <p><Link href="/login">Entrar a AFP →</Link></p>
  </PublicInfoPage>;
}
