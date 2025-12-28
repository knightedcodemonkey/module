export const View = ({ title, target }: { title: string; target: string }) => (
  <section data-target={target}>
    <h1>{title}</h1>
    <p>ready</p>
  </section>
)
