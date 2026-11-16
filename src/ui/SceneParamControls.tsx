import { useStore } from 'zustand';
import type { Param, ParamValue } from '@/engine/scene/params';
import type { SceneModule } from '@/engine/scene/SceneModule';
import { sceneParamsStore } from '@/state/sceneParams';
import { Select, Slider, Toggle } from '@/ui/controls';

function ParamControl(props: { sceneId: string; name: string; param: Param }) {
  const { sceneId, name, param } = props;
  const value = useStore(sceneParamsStore, (s) => s.values[sceneId]?.[name] ?? param.default);
  const set = (v: ParamValue) => sceneParamsStore.getState().set(sceneId, name, v);

  if (param.kind === 'boolean') {
    return <Toggle label={param.label} checked={value === true} onChange={set} />;
  }
  if (param.kind === 'choice') {
    return (
      <Select
        label={param.label}
        value={typeof value === 'string' ? value : param.default}
        options={param.options}
        onChange={set}
      />
    );
  }
  return (
    <Slider
      label={param.label}
      value={typeof value === 'number' ? value : param.default}
      min={param.min}
      max={param.max}
      step={param.step}
      onChange={set}
      format={(v) => v.toFixed(param.digits ?? 1)}
    />
  );
}

/** A control for every visible param in the scene's schema, in declaration order. */
export function SceneParamControls(props: { scene: SceneModule }) {
  const { scene } = props;
  return (
    <>
      {Object.entries(scene.params)
        .filter(([, param]) => !param.hidden)
        .map(([name, param]) => (
          <ParamControl key={`${scene.id}:${name}`} sceneId={scene.id} name={name} param={param} />
        ))}
    </>
  );
}
