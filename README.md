# cloud_computing_hw2

In order to run the cloudFormation:

Go to the root folder (where the stack.json is located) and run the following command:

aws cloudformation create-stack --stack-name (stack-name) --template-body file://stack.json --capabilities CAPABILITY_NAMED_IAM
