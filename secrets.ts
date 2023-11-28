import * as pulumi from '@pulumi/pulumi';
import * as aws from '@pulumi/aws';

type InputMap = Record<string, pulumi.Input<string>>;

type ContainerSecret = {
  name: string;
  valueFrom: pulumi.Input<string>;
};

export function makeSsmParameterSecrets<T extends InputMap>(
  prefix: string,
  role: aws.iam.Role,
  keys: T,
  opts?: pulumi.ResourceOptions,
): ContainerSecret[] {
  new aws.iam.RolePolicy(`${prefix}-ssm-params`, {
    role,
    policy: {
      Version: '2012-10-17',
      Statement: [
        {
          Effect: 'Allow',
          Action: ['ssm:GetParameters'],
          Resource: `arn:aws:ssm:*:*:parameter/${prefix}-*`,
        },
      ],
    },
  });

  const result: ContainerSecret[] = [];
  for (const [key, value] of Object.entries(keys)) {
    const param = new aws.ssm.Parameter(
      `${prefix}-${key}`,
      {
        type: 'String',
        value,
      },
      opts,
    );

    result.push({
      name: key,
      valueFrom: param.arn,
    });
  }

  return result;
}
